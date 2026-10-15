import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { BackupService } from '../../src/lib/server/backups/service.ts';
import { RestoreService } from '../../src/lib/server/backups/restore.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import {
  canonicalNoteMutation,
  type NoteMutation,
} from '../../src/lib/shared/notes.ts';

const secret = 'synthetic-voice-backup password 語音';
const sha = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
const webm = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
  Buffer.from('webm'),
  Buffer.alloc(988, 7),
]);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypM4A '),
  Buffer.alloc(988, 9),
]);
const ogg = Buffer.concat([Buffer.from('OggS\0\x02'), Buffer.alloc(994, 3)]);
// Looks like a webm container but was never flagged as a voice clip.
const plainWebm = Buffer.concat([webm.subarray(0, 12), Buffer.alloc(300, 5)]);

const clips = [
  { name: 'a.webm', bytes: webm, mime: 'audio/webm', voice: true },
  { name: 'b.m4a', bytes: mp4, mime: 'audio/mp4', voice: true },
  { name: 'c.ogg', bytes: ogg, mime: 'audio/ogg', voice: true },
  {
    name: 'plain.webm',
    bytes: plainWebm,
    mime: 'application/octet-stream',
    voice: false,
  },
];

it('VN-BACKUP: a full archive restore keeps voice clips, their MIME class, bytes and Range playback', async () => {
  await withPersistence(async (source) => {
    const sourceAuth = new AuthService(source);
    const credential = await createFixtureAccount(
      sourceAuth,
      secret,
      '192.0.2.90',
    );
    const identity = sourceAuth.authenticate(credential.token)!;
    const ids = clips.map(() => randomUUID());
    const command: Extract<NoteMutation, { action: 'create' }> = {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'voice backup #Voice',
        timelineAt: null,
        attachmentIds: ids,
      },
    };
    const disk = new DiskBudget(source.storage.root, 0);
    const attachments = new AttachmentService(source, disk);
    const batch = attachments.initialize(identity, {
      mutationId: command.mutationId,
      requestDigest: sha(canonicalNoteMutation(command)),
      items: clips.map((clip, i) => ({
        id: ids[i],
        filename: clip.name,
        incomingBytes: clip.bytes.length,
        incomingDigest: sha(clip.bytes),
        ...(clip.voice ? { voice: true } : {}),
      })),
    });
    if (batch.state !== 'batch') throw Error('batch');
    for (const [i, clip] of clips.entries())
      await attachments.upload(
        identity,
        batch.batch.id,
        ids[i],
        new Request('http://localhost/upload', {
          method: 'PUT',
          body: new Uint8Array(clip.bytes),
        }),
      );
    const created = new NoteService(source).mutate(identity, command);

    const backups = new BackupService(source, sourceAuth, disk);
    const job = backups.create(identity, { id: randomUUID() });
    await backups.wait();
    expect(backups.list(identity)[0].state).toBe('complete');
    const archive = source.storage.backupPath(job.id);

    await withPersistence(async (destination) => {
      const destAuth = new AuthService(destination);
      const destCredential = await createFixtureAccount(
        destAuth,
        'synthetic-voice-destination password',
        '192.0.2.91',
      );
      const destIdentity = destAuth.authenticate(destCredential.token)!;
      const destDisk = new DiskBudget(destination.storage.root, 0);
      const restores = new RestoreService(
        destination,
        destAuth,
        new BackupService(destination, destAuth, destDisk),
        destDisk,
        {},
      );
      const bytes = readFileSync(archive);
      const grant = async () =>
        (
          await destAuth.freshAuth(
            destIdentity,
            'restore',
            'synthetic-voice-destination password',
            undefined,
            `192.0.2.${100 + Math.floor(Math.random() * 100)}`,
          )
        ).token;
      const summary = await restores.upload(
        destIdentity,
        new Request('http://localhost/api/restores', {
          method: 'POST',
          headers: {
            'x-archive-bytes': String(bytes.length),
            'x-restore-grant': await grant(),
          },
          body: new Uint8Array(bytes),
        }),
      );
      expect(summary).toMatchObject({ notes: 1, attachments: clips.length });
      await restores.confirm(destIdentity, {
        id: summary.id,
        confirmed: true,
        grant: await grant(),
      });

      // The archive replaced the account; sign in as the restored owner.
      const login = await destAuth.login('fixture', secret, '192.0.2.92');
      if (login.mfaRequired) throw Error('Unexpected MFA');
      const restored = destAuth.authenticate(login.token)!;
      expect(restored.account.id).toBe(identity.account.id);
      const restoredAttachments = new AttachmentService(destination, destDisk);
      const note = new NoteService(destination).get(restored, created.noteId);
      expect(note.attachments?.map((a) => a.id).sort()).toEqual(
        [...ids].sort(),
      );

      for (const [i, clip] of clips.entries()) {
        const full = await restoredAttachments.download(
          restored,
          ids[i],
          'file',
        );
        expect(full.status, clip.name).toBe(200);
        expect(full.headers.get('content-type'), clip.name).toBe(clip.mime);
        expect(await Buffer.from(await full.arrayBuffer())).toEqual(clip.bytes);
        if (!clip.voice) {
          expect(full.headers.get('content-disposition')).toMatch(
            /^attachment;/,
          );
          expect(full.headers.has('accept-ranges')).toBe(false);
          continue;
        }
        expect(full.headers.get('accept-ranges')).toBe('bytes');
        expect(full.headers.get('content-disposition')).toMatch(/^inline;/);
        expect(full.headers.get('x-content-type-options')).toBe('nosniff');
        expect(full.headers.get('content-security-policy')).toContain(
          'sandbox',
        );
        const etag = full.headers.get('etag')!;
        expect(etag).toBe(`"${sha(clip.bytes)}"`);
        const part = await restoredAttachments.download(
          restored,
          ids[i],
          'file',
          false,
          false,
          { range: 'bytes=10-19' },
        );
        expect(part.status, clip.name).toBe(206);
        expect(part.headers.get('content-range')).toBe(
          `bytes 10-19/${clip.bytes.length}`,
        );
        expect(Buffer.from(await part.arrayBuffer())).toEqual(
          clip.bytes.subarray(10, 20),
        );
        const tail = await restoredAttachments.download(
          restored,
          ids[i],
          'file',
          false,
          false,
          { range: 'bytes=-5', ifRange: etag },
        );
        expect(tail.status).toBe(206);
        expect(Buffer.from(await tail.arrayBuffer())).toEqual(
          clip.bytes.subarray(-5),
        );
        // ?download=1 stays an opaque attachment download after restore.
        const download = await restoredAttachments.download(
          restored,
          ids[i],
          'file',
          true,
        );
        expect(download.headers.get('content-type')).toBe(
          'application/octet-stream',
        );
        expect(download.headers.get('content-disposition')).toMatch(
          /^attachment;/,
        );
        await download.arrayBuffer();
      }
      // The stored private bytes are identical to the source files.
      for (const [i, clip] of clips.entries())
        expect(
          readFileSync(
            destination.storage.attachmentPath(ids[i], 'attachment.bin'),
          ),
        ).toEqual(clip.bytes);
    });
  });
}, 60_000);
