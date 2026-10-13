import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { generateSync } from 'otplib';
import { decryptSecret } from '../../src/lib/server/auth/factors.ts';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withPersistence, seedNote } from '../helpers/persistence.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { BackupService } from '../../src/lib/server/backups/service.ts';
import {
  verifyArchive,
  writeArchive,
} from '../../src/lib/server/backups/archive.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import {
  canonicalNoteMutation,
  type NoteMutation,
} from '../../src/lib/shared/notes.ts';
import {
  backupJobs,
  sessions,
  account,
  tagChanges,
  tagMutationReceipts,
} from '../../src/lib/server/db/schema.ts';
import type { FreshAuthScope } from '../../src/lib/shared/auth.ts';
const password = 'synthetic-backup-only 密碼 password';
async function fixture(p: Persistence) {
  const auth = new AuthService(p);
  const initial = await createFixtureAccount(auth, password, '192.0.2.70');
  const identity = auth.authenticate(initial.token)!;
  return {
    auth,
    identity,
    initial,
    grant: async (scope: FreshAuthScope) =>
      (await auth.freshAuth(identity, scope, password, undefined, '192.0.2.70'))
        .token,
  };
}
async function payloads(path: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  const extract = tar.extract();
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      result.set(header.name, Buffer.concat(chunks));
      next();
    })().catch(next);
  });
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(path), createGunzip(), extract);
  return result;
}
const sha = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
async function upload(
  p: Persistence,
  f: Awaited<ReturnType<typeof fixture>>,
  bytes: Buffer,
  command?: Extract<NoteMutation, { action: 'create' }>,
) {
  const s = new AttachmentService(p, new DiskBudget(p.storage.root, 0));
  const id = command?.content.attachmentIds[0] ?? randomUUID();
  const result = s.initialize(f.identity, {
    mutationId: command?.mutationId ?? randomUUID(),
    requestDigest: command
      ? sha(canonicalNoteMutation(command))
      : 'a'.repeat(64),
    items: [
      {
        id,
        filename: 'private-香港.txt',
        incomingBytes: bytes.length,
        incomingDigest: sha(bytes),
      },
    ],
  });
  if (result.state !== 'batch') throw new Error('Expected batch');
  await s.upload(
    f.identity,
    result.batch.id,
    id,
    new Request('http://localhost/upload', {
      method: 'PUT',
      body: new Uint8Array(bytes),
    }),
  );
  return { s, id };
}
it('captures WAL notes/drafts/Trash/files/settings/auth/keys/history/receipts, strips transient data and downloads byte-identically', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    const bytes = Buffer.from('private file unchanged');
    const command: NoteMutation = {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'snapshot 香港 #Work',
        attachmentIds: [randomUUID()],
        timelineAt: null,
      },
    };
    await upload(p, f, bytes, command);
    const note = new NoteService(p).mutate(f.identity, command);
    seedNote(p, 'published');
    seedNote(p, 'trash');
    const pending = await upload(p, f, Buffer.from('pending excluded'));
    p.write((tx) => {
      tx.insert(tagChanges)
        .values({
          oldKey: 'old',
          action: 'rename',
          targetKey: 'work',
          scope: 'subtree',
          createdAt: Date.now(),
        })
        .run();
      tx.insert(tagMutationReceipts)
        .values({
          mutationId: randomUUID(),
          accountId: f.identity.account.id,
          requestDigest: 'a'.repeat(64),
          resultJson: '{}',
          createdAt: Date.now(),
        })
        .run();
    });
    const copy = p.storage.preUpgradeDirectory('current', true);
    writeFileSync(
      join(copy, 'pandanote.sqlite'),
      'excluded upgrade copy sentinel',
    );
    writeFileSync(join(copy, 'manifest.json'), '{}');
    const s = new BackupService(p, f.auth, new DiskBudget(root, 0));
    const id = randomUUID();
    expect(() =>
      s.create(f.identity, { id, grant: 'a'.repeat(43) } as { id: string }),
    ).toThrow(/Invalid backup request/);
    s.create(f.identity, { id });
    await s.wait();
    expect(s.list(f.identity)[0]).toMatchObject({
      id,
      state: 'complete',
      progress: 100,
    });
    const path = p.storage.backupPath(id);
    const manifest = await verifyArchive(path, AbortSignal.timeout(10_000));
    expect(manifest).toMatchObject({ formatVersion: 2, schemaVersion: 2 });
    expect(manifest.excluded).toContain('pre-upgrade');
    expect(
      manifest.entries.every((entry) => !entry.path.includes('pre-upgrade')),
    ).toBe(true);
    expect(manifest.counts).toEqual({ notes: 3, attachments: 1 });
    const entries = await payloads(path);
    expect(
      entries.get(`files/${command.content.attachmentIds[0]}/attachment.bin`),
    ).toEqual(bytes);
    expect([...entries.keys()].some((name) => name.includes(pending.id))).toBe(
      false,
    );
    expect(
      JSON.parse(entries.get('snapshot/key-material.json')!.toString()),
    ).toEqual(p.storage.readKeys());
    const inspected = join(root, 'inspection.sqlite');
    expect(
      entries
        .get('snapshot/pandanote.sqlite')!
        .includes(Buffer.from(f.identity.sessionHash)),
    ).toBe(false);
    writeFileSync(inspected, entries.get('snapshot/pandanote.sqlite')!);
    const db = new Database(inspected, { readonly: true });
    try {
      db.pragma('trusted_schema = OFF');
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(db.pragma('foreign_key_check')).toEqual([]);
      for (const table of [
        'sessions',
        'auth_challenges',
        'auth_rate_limits',
        'upload_batches',
        'file_cleanup_jobs',
        'backup_jobs',
        'note_search',
        'note_search_fts',
      ])
        expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({
          n: 0,
        });
      expect(db.prepare('SELECT batch_id FROM attachments').get()).toEqual({
        batch_id: null,
      });
      expect(db.prepare('SELECT note_id FROM note_attachments').get()).toEqual({
        note_id: note.noteId,
      });
      expect(
        db.prepare('SELECT count(*) n FROM mutation_receipts').get(),
      ).toEqual({ n: 1 });
      expect(
        db.prepare('SELECT count(*) n FROM tag_mutation_receipts').get(),
      ).toEqual({ n: 1 });
      expect(db.prepare('SELECT count(*) n FROM tag_changes').get()).toEqual({
        n: 1,
      });
      expect(db.prepare('SELECT value_json FROM app_settings').get()).toEqual(
        p.native.prepare('SELECT value_json FROM app_settings').get(),
      );
      expect(
        db.prepare('SELECT username,email,password_hash FROM account').get(),
      ).toEqual(
        p.native
          .prepare('SELECT username,email,password_hash FROM account')
          .get(),
      );
      expect(
        db
          .prepare("SELECT 1 FROM sqlite_schema WHERE name='setup_tokens'")
          .get(),
      ).toBeUndefined();
      expect(
        db
          .prepare(
            "SELECT sql FROM sqlite_schema WHERE name='attachments_referenced_guard'",
          )
          .get(),
      ).toEqual(
        p.native
          .prepare(
            "SELECT sql FROM sqlite_schema WHERE name='attachments_referenced_guard'",
          )
          .get(),
      );
    } finally {
      db.close();
    }
    const response = await s.download(f.identity, id, {});
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      readFileSync(path),
    );
    // Existing archive is not nested into another manual archive.
    s.create(f.identity, {
      id: randomUUID(),
    });
    await s.wait();
    expect(s.list(f.identity).every((job) => job.state === 'complete')).toBe(
      true,
    );
    expect(readdirSync(join(root, 'staging/backups'))).toEqual([]);
    await s.delete(f.identity, id, { confirmed: true });
    expect(existsSync(path)).toBe(false);
    expect(s.list(f.identity)).toHaveLength(1);
    expect(p.db.select().from(sessions).all()).toHaveLength(1);
    expect(
      pending.s.status(
        f.identity,
        p.db
          .select()
          .from(
            (await import('../../src/lib/server/db/schema.ts')).uploadBatches,
          )
          .all()
          .find((batch) => batch.status === 'pending')!.id,
      ).status,
    ).toBe('pending');
    console.log(
      'S16 synthetic snapshot metrics',
      s.metrics.get(id),
      'archiveBytes',
      statSync(p.storage.backupPath(s.list(f.identity)[0].id)).size,
    );
  });
});
it.each([false, true])(
  'drains admitted writers, rejects new writes during capture, preserves files after live deletion, releases gate before archiving (forceCopy=%s)',
  async (forceCopy) => {
    await withPersistence(async (p, root) => {
      const f = await fixture(p);
      const command: NoteMutation = {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: 'before capture',
          attachmentIds: [randomUUID()],
          timelineAt: null,
        },
      };
      await upload(p, f, Buffer.from('captured bytes'), command);
      const notes = new NoteService(p),
        saved = notes.mutate(f.identity, command);
      let release!: () => void;
      const held = p.coordinator.writeAsync(async (lease) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        p.write(
          (tx) => tx.update(account).set({ lastTotpStep: 42 }).run(),
          lease,
        );
      });
      let captured = false;
      const s = new BackupService(p, f.auth, new DiskBudget(root, 0), {
        forceCopy,
        checkpoint: async (phase) => {
          if (phase === 'capturing') {
            expect(p.coordinator.state).toBe('exclusive');
            expect(() =>
              notes.mutate(f.identity, {
                action: 'trash',
                mutationId: randomUUID(),
                noteId: saved.noteId,
                expectedRevision: 1,
              }),
            ).toThrow(/Maintenance/);
            expect(notes.get(f.identity, saved.noteId).bodyMarkdown).toBe(
              'before capture',
            );
          }
          if (phase === 'captured') {
            captured = true;
            expect(p.coordinator.state).toBe('open');
            notes.mutate(f.identity, {
              action: 'trash',
              mutationId: randomUUID(),
              noteId: saved.noteId,
              expectedRevision: 1,
            });
            notes.mutate(f.identity, {
              action: 'permanent-delete',
              mutationId: randomUUID(),
              noteId: saved.noteId,
              expectedRevision: 2,
              confirmed: true,
            });
            await (
              await import('../../src/lib/server/attachments/cleanup.ts')
            ).runAttachmentCleanup(p);
            expect(
              existsSync(
                p.storage.attachmentPath(
                  command.content.attachmentIds[0],
                  'attachment.bin',
                ),
              ),
            ).toBe(false);
          }
        },
      });
      s.create(f.identity, {
        id: randomUUID(),
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(p.coordinator.state).toBe('draining');
      release();
      await held;
      await s.wait();
      expect(captured).toBe(true);
      expect(s.list(f.identity)[0].state).toBe('complete');
      const entries = await payloads(
        p.storage.backupPath(s.list(f.identity)[0].id),
      );
      expect(
        entries
          .get(`files/${command.content.attachmentIds[0]}/attachment.bin`)
          ?.toString(),
      ).toBe('captured bytes');
    });
  },
);
it('waits for an actual streamed admitted upload to finish, rejects new uploads while draining, and excludes its uncommitted ready bytes', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    seedNote(p);
    const uploads = new AttachmentService(p, new DiskBudget(root, 0));
    const id = randomUUID(),
      bytes = Buffer.from('admitted slow upload');
    const manifest = {
      mutationId: randomUUID(),
      requestDigest: 'a'.repeat(64),
      items: [
        {
          id,
          filename: 'pending.txt',
          incomingBytes: bytes.length,
          incomingDigest: sha(bytes),
        },
      ],
    };
    const batch = uploads.initialize(f.identity, manifest);
    if (batch.state !== 'batch') throw new Error('Expected batch');
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(new Uint8Array(bytes.subarray(0, 2)));
      },
    });
    const uploading = uploads.upload(
      f.identity,
      batch.batch.id,
      id,
      new Request('http://localhost/upload', {
        method: 'PUT',
        body,
        duplex: 'half',
      } as RequestInit),
    );
    const s = new BackupService(p, f.auth, new DiskBudget(root, 0));
    const job = s.create(f.identity, { id: randomUUID() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.coordinator.state).toBe('draining');
    expect(() =>
      uploads.initialize(f.identity, {
        mutationId: randomUUID(),
        requestDigest: 'a'.repeat(64),
        items: [],
      }),
    ).toThrow(/Maintenance/);
    controller.enqueue(new Uint8Array(bytes.subarray(2)));
    controller.close();
    await uploading;
    await s.wait();
    expect(s.list(f.identity)[0].state).toBe('complete');
    expect(
      (
        await verifyArchive(
          p.storage.backupPath(job.id),
          AbortSignal.timeout(10_000),
        )
      ).counts.attachments,
    ).toBe(0);
    expect(
      uploads.status(f.identity, batch.batch.id).attachments[0].readiness,
    ).toBe('ready');
  });
});
it('fails cleanly for full disk, corruption and pre-publication interruption, keeps live data, and recovers unfinished/missing jobs on restart', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    seedNote(p);
    const full = new BackupService(
      p,
      f.auth,
      new DiskBudget(root, 0, () => ({ available: 0, total: 1 })),
    );
    const id = randomUUID();
    full.create(f.identity, { id });
    await full.wait();
    expect(full.list(f.identity)[0]).toMatchObject({
      state: 'failed',
      errorCode: 'storage-full',
    });
    expect(existsSync(p.storage.backupPath(id))).toBe(false);
    const failed = new BackupService(p, f.auth, new DiskBudget(root, 0), {
      checkpoint: async (phase) => {
        if (phase === 'verified') throw new Error('synthetic interruption');
      },
    });
    failed.create(f.identity, {
      id: randomUUID(),
    });
    await failed.wait();
    expect(failed.list(f.identity).every((job) => job.state === 'failed')).toBe(
      true,
    );
    expect(p.native.prepare('SELECT count(*) n FROM notes').get()).toEqual({
      n: 1,
    });
    const fullDuringFinalize = new BackupService(
      p,
      f.auth,
      new DiskBudget(root, 0),
      {
        checkpoint: async (phase) => {
          if (phase === 'verified')
            throw Object.assign(new Error('synthetic full filesystem'), {
              code: 'SQLITE_FULL',
            });
        },
      },
    );
    const fullId = randomUUID();
    fullDuringFinalize.create(f.identity, {
      id: fullId,
    });
    await fullDuringFinalize.wait();
    expect(
      fullDuringFinalize.list(f.identity).find((job) => job.id === fullId),
    ).toMatchObject({ state: 'failed', errorCode: 'storage-full' });
    expect(readdirSync(join(root, 'staging/backups'))).toEqual([]);
    const interrupted = randomUUID();
    writeFileSync(p.storage.backupPath(interrupted), 'partial');
    writeFileSync(
      join(p.storage.stagingDirectory('backups', interrupted), 'partial'),
      'partial',
    );
    p.write((tx) =>
      tx
        .insert(backupJobs)
        .values({
          id: interrupted,
          state: 'archiving',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run(),
    );
    const restarted = new BackupService(p, f.auth, new DiskBudget(root, 0));
    expect(restarted.list(f.identity)[0]).toMatchObject({
      id: interrupted,
      state: 'failed',
      errorCode: 'interrupted',
    });
    expect(existsSync(p.storage.backupPath(interrupted))).toBe(false);
    expect(readdirSync(join(root, 'staging/backups'))).toEqual([]);
    expect(p.coordinator.state).toBe('open');
  });
});
it('rejects revoked identities, extra create fields and unconfirmed deletion; exact create retries do not duplicate jobs', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p),
      s = new BackupService(p, f.auth, new DiskBudget(root, 0));
    const id = randomUUID();
    expect(() =>
      s.create(f.identity, { id, grant: 'a'.repeat(43) } as { id: string }),
    ).toThrow(/Invalid backup request/);
    s.create(f.identity, { id });
    await s.wait();
    s.create(f.identity, { id });
    expect(s.list(f.identity)).toHaveLength(1);
    await expect(
      s.delete(f.identity, id, { confirmed: false }),
    ).rejects.toThrow(/Confirm/);
    p.write((tx) =>
      tx
        .delete(sessions)
        .where(eq(sessions.tokenHash, f.identity.sessionHash))
        .run(),
    );
    expect(() => s.list(f.identity)).toThrow(/Sign in/);
    await expect(s.download(f.identity, id, {})).rejects.toThrow();
  });
});
it('backs up processed image variants and portable MFA/recovery state without original inputs', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    const enroll = f.auth.startEnrollment(
      f.identity,
      await f.grant('mfa-enroll'),
    );
    const enabled = f.auth.confirmEnrollment(
      f.identity,
      enroll.challenge,
      generateSync({ secret: enroll.secret, epoch: Date.now() / 1000 }),
      '192.0.2.70',
    );
    const identity = f.auth.authenticate(enabled.credential.token)!;
    const id = randomUUID();
    const command: Extract<NoteMutation, { action: 'create' }> = {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: `![image](attachment:${id})`,
        attachmentIds: [id],
        timelineAt: null,
      },
    };
    const image = await sharp({
      create: { width: 20, height: 15, channels: 3, background: '#4c6952' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await upload(p, { ...f, identity }, image, command);
    new NoteService(p).mutate(identity, command);
    const s = new BackupService(p, f.auth, new DiskBudget(root, 0));
    const job = s.create(identity, { id: randomUUID() });
    await s.wait();
    expect(s.list(identity)[0].state).toBe('complete');
    const files = await payloads(p.storage.backupPath(job.id));
    expect(files.has(`files/${id}/attachment.bin`)).toBe(false);
    for (const variant of ['display.webp', 'thumbnail.webp'] as const) {
      const bytes = files.get(`files/${id}/${variant}`)!;
      expect(bytes).toEqual(
        readFileSync(p.storage.attachmentPath(id, variant)),
      );
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
    }
    const inspected = join(root, 'mfa-inspection.sqlite');
    writeFileSync(inspected, files.get('snapshot/pandanote.sqlite')!);
    const db = new Database(inspected, { readonly: true });
    try {
      const owner = db
        .prepare('SELECT id, totp_enabled, totp_secret_encrypted FROM account')
        .get() as {
        id: string;
        totp_enabled: number;
        totp_secret_encrypted: string;
      };
      expect(owner.totp_enabled).toBe(1);
      expect(
        decryptSecret(
          JSON.parse(files.get('snapshot/key-material.json')!.toString()),
          owner.totp_secret_encrypted,
          `account:${owner.id}`,
        ),
      ).toBe(enroll.secret);
      expect(
        db
          .prepare(
            'SELECT count(*) n FROM recovery_codes WHERE consumed_at IS NULL',
          )
          .get(),
      ).toEqual({ n: 10 });
    } finally {
      db.close();
    }
  });
});
it('bounded capture/archiving timeout fails safely, and a security change draining into capture invalidates its admitted identity', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    seedNote(p);
    const s = new BackupService(p, f.auth, new DiskBudget(root, 0), {
      captureMs: 1,
      checkpoint: async (phase) => {
        if (phase === 'capturing')
          await new Promise((resolve) => setTimeout(resolve, 10));
      },
    });
    s.create(f.identity, {
      id: randomUUID(),
    });
    await s.wait();
    expect(s.list(f.identity)[0].state).toBe('failed');
    expect(p.coordinator.state).toBe('open');
    let release!: () => void;
    const held = p.coordinator.writeAsync(async (lease) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      p.write(
        (tx) => tx.update(account).set({ securityRevision: 2 }).run(),
        lease,
      );
    });
    const later = new BackupService(p, f.auth, new DiskBudget(root, 0));
    later.create(f.identity, { id: randomUUID() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await held;
    await later.wait();
    expect(
      p.db
        .select()
        .from(backupJobs)
        .all()
        .every((job) => job.state === 'failed'),
    ).toBe(true);
    expect(readdirSync(join(root, 'backups'))).toEqual([]);
  });
});
it('a real killed process after archive verification is failed on restart; no partial download or live-data loss', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    seedNote(p);
    const id = randomUUID();
    const storage = p.storage;
    await p.close();
    const url = (part: string) =>
      pathToFileURL(join(process.cwd(), 'src/lib/server', part)).href;
    const marker = join(root, 'kill-marker');
    const script = `
      import { Persistence } from ${JSON.stringify(url('db/connection.ts'))};
      import { PrivateStorage } from ${JSON.stringify(url('storage/private-storage.ts'))};
      import { AuthService } from ${JSON.stringify(url('auth/service.ts'))};
      import { BackupService } from ${JSON.stringify(url('backups/service.ts'))};
      import { DiskBudget } from ${JSON.stringify(url('attachments/resources.ts'))};
      import { writeFileSync } from 'node:fs';
      const root = ${JSON.stringify(root)};
      const p = new Persistence(new PrivateStorage({dataDir: root}));
      const s = new BackupService(p, new AuthService(p), new DiskBudget(root, 0), { checkpoint: async phase => {
        if (phase === 'verified') { writeFileSync(${JSON.stringify(marker)}, 'verified'); await new Promise(() => { setInterval(() => {}, 1000); }); }
      }});
      s.create(${JSON.stringify(f.identity)}, { id: ${JSON.stringify(id)} });
      await s.wait();
    `;
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', script],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    let errors = '';
    child.stderr.on('data', (bytes: Buffer) => {
      errors += bytes.toString();
    });
    const closed = new Promise<void>((resolve) =>
      child.on('close', () => resolve()),
    );
    try {
      const until = Date.now() + 8000;
      while (
        !existsSync(marker) &&
        child.exitCode === null &&
        Date.now() < until
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      expect(existsSync(marker), errors).toBe(true);
    } finally {
      child.kill('SIGKILL');
      await closed;
    }
    const restarted = new Persistence(storage);
    try {
      const s = new BackupService(
        restarted,
        new AuthService(restarted),
        new DiskBudget(root, 0),
      );
      expect(s.list(f.identity)[0]).toMatchObject({
        id,
        state: 'failed',
        errorCode: 'interrupted',
      });
      expect(existsSync(storage.backupPath(id))).toBe(false);
      expect(readdirSync(join(root, 'staging/backups'))).toEqual([]);
      expect(
        restarted.native.prepare('SELECT count(*) n FROM notes').get(),
      ).toEqual({ n: 1 });
      expect(restarted.native.pragma('integrity_check', { simple: true })).toBe(
        'ok',
      );
    } finally {
      await restarted.close();
    }
  });
});
it('production archive verifier rejects checksum changes, truncation, unexpected paths, duplicate entries and hidden PAX/GNU/link/device headers without extraction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-backup-format-'));
  try {
    const db = Buffer.from('synthetic DB fixture'),
      keys = Buffer.from('synthetic keys');
    const manifest = {
      format: 'PandaNote' as const,
      formatVersion: 2 as const,
      schemaVersion: 2,
      appVersion: '0.0.0',
      createdAt: Date.now(),
      counts: { notes: 0, attachments: 0 },
      included:
        'notes,trash,tags,receipts,files,settings,account,mfa,recovery-codes,portable-keys' as const,
      excluded:
        'unsaved-editors,sessions,challenges,rate-limits,pending-uploads,cleanup-jobs,search,backup-catalog,archives,staging,pre-upgrade,deployment' as const,
      entries: [
        { path: 'snapshot/pandanote.sqlite', size: db.length, sha256: sha(db) },
        {
          path: 'snapshot/key-material.json',
          size: keys.length,
          sha256: sha(keys),
        },
      ],
    };
    mkdirSync(join(root, 'snapshot'));
    writeFileSync(join(root, 'snapshot/pandanote.sqlite'), db);
    writeFileSync(join(root, 'snapshot/key-material.json'), keys);
    const path = join(root, 'valid.pnb');
    await writeArchive(
      path,
      manifest,
      (name) => join(root, name),
      AbortSignal.timeout(10_000),
    );
    expect(await verifyArchive(path, AbortSignal.timeout(10_000))).toEqual(
      manifest,
    );
    const { gunzipSync } = await import('node:zlib');
    const raw = gunzipSync(readFileSync(path));
    const malicious = join(root, 'malicious.pnb');
    for (const type of ['x', 'g', 'L', 'K', '1', '2', '3', '5']) {
      const changed = Buffer.from(raw);
      changed[156] = type.charCodeAt(0);
      await writeFile(malicious, gzipSync(changed));
      await expect(
        verifyArchive(malicious, AbortSignal.timeout(10_000)),
      ).rejects.toThrow();
    }
    const changed = Buffer.from(raw);
    const offset = changed.indexOf(db);
    changed[offset] ^= 1;
    await writeFile(malicious, gzipSync(changed));
    await expect(
      verifyArchive(malicious, AbortSignal.timeout(10_000)),
    ).rejects.toThrow(/Checksum/);
    await writeFile(malicious, readFileSync(path).subarray(0, 30));
    await expect(
      verifyArchive(malicious, AbortSignal.timeout(10_000)),
    ).rejects.toThrow();
    for (const name of [
      '../escape',
      'snapshot/pandanote.sqlite',
      'C:/escape',
    ]) {
      const pack = tar.pack();
      const done = pipeline(
        pack,
        (await import('node:zlib')).createGzip(),
        (await import('node:fs')).createWriteStream(malicious),
      );
      pack.entry({ name: 'manifest.json' }, JSON.stringify(manifest));
      pack.entry({ name: 'snapshot/pandanote.sqlite' }, db);
      pack.entry({ name }, db);
      pack.finalize();
      await done;
      await expect(
        verifyArchive(malicious, AbortSignal.timeout(10_000)),
      ).rejects.toThrow();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
