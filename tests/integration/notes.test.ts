import { createHash, randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import {
  NoteService,
  NoteConflictError,
  noteMutationDigest,
} from '../../src/lib/server/notes/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import { runAttachmentCleanup } from '../../src/lib/server/attachments/cleanup.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  sessions,
  notes,
  attachments,
  noteAttachments,
  noteSearch,
  mutationReceipts,
  fileCleanupJobs,
  uploadBatches,
  appSettings,
  tagChanges,
} from '../../src/lib/server/db/schema.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import type { NoteContent, NoteMutation } from '../../src/lib/shared/notes.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import { noteErrorResponse } from '../../src/lib/server/notes/http.ts';

function identity(p: Persistence): SessionIdentity {
  const id = seedAccount(p);
  const sessionHash = 'b'.repeat(64);
  const expiresAt = Date.now() + 3_600_000;
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        expiresAt,
        createdAt: Date.now(),
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    sessionHash,
    securityRevision: 1,
    expiresAt,
  };
}
const content = (
  bodyMarkdown = '今日香港 #Work #work #図書館',
): NoteContent => ({
  bodyMarkdown,
  timelineAt: Date.now() - 86_400_000,
  location: null,
  attachmentIds: [],
});
const create = (body = content()): NoteMutation => ({
  action: 'create',
  mutationId: randomUUID(),
  content: body,
});
function edit(
  noteId: string,
  expectedRevision: number,
  body: NoteContent,
  action: 'update' = 'update',
): NoteMutation {
  return {
    action,
    noteId,
    expectedRevision,
    mutationId: randomUUID(),
    content: body,
  };
}
function action(
  noteId: string,
  expectedRevision: number,
  name: 'trash' | 'restore' | 'permanent-delete',
): NoteMutation {
  return name === 'permanent-delete'
    ? {
        action: name,
        noteId,
        expectedRevision,
        mutationId: randomUUID(),
        confirmed: true,
      }
    : { action: name, noteId, expectedRevision, mutationId: randomUUID() };
}
async function upload(
  p: Persistence,
  owner: SessionIdentity,
  value: NoteMutation,
  inputs: Buffer[],
  digest = noteMutationDigest(value),
) {
  if (!('content' in value)) throw new Error('Expected content');
  const service = new AttachmentService(p, new DiskBudget(p.storage.root, 0));
  const initialized = service.initialize(owner, {
    mutationId: value.mutationId,
    requestDigest: digest,
    items: inputs.map((input, i) => ({
      id: value.content.attachmentIds[i],
      filename: `香港-${i}.dat`,
      incomingBytes: input.length,
      incomingDigest: createHash('sha256').update(input).digest('hex'),
    })),
  });
  if (initialized.state !== 'batch') throw new Error('Expected pending batch');
  for (const [i, input] of inputs.entries())
    await service.upload(
      owner,
      initialized.batch.id,
      value.content.attachmentIds[i],
      new Request('http://localhost/upload', {
        method: 'PUT',
        body: new Uint8Array(input),
      }),
    );
  return { service, batch: initialized.batch };
}
function count(p: Persistence, table: string): number {
  return (
    p.native.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;
}

describe('S07 real atomic note lifecycle', () => {
  it('commits body/tags/search/receipt together and returns exactly one original success after response loss, edits and deletion', async () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new NoteService(p),
        value = create();
      const result = service.mutate(owner, value);
      expect(service.mutate(owner, value)).toEqual(result);
      expect(count(p, 'notes')).toBe(1);
      const saved = service.get(owner, result.noteId);
      expect(saved).toMatchObject({
        tags: ['work', '図書館'],
        revision: 1,
        status: 'published',
        contentEditedAt: null,
      });
      expect(p.db.select().from(noteSearch).get()).toMatchObject({
        bodyNormalized: '今日香港 #work #work #図書館',
        tagFieldsJson: '["work","図書館"]',
        sourceRevision: 1,
      });
      service.mutate(owner, edit(result.noteId, 1, content('changed')));
      expect(service.mutate(owner, value)).toEqual(result);
      const trashed = service.mutate(owner, action(result.noteId, 2, 'trash'));
      const deletion = action(
        result.noteId,
        trashed.revision,
        'permanent-delete',
      );
      const deleted = service.mutate(owner, deletion);
      expect(service.mutate(owner, deletion)).toEqual(deleted);
      expect(service.mutate(owner, value)).toEqual(result);
      expect(count(p, 'notes')).toBe(0);
      expect(count(p, 'note_tags')).toBe(0);
      expect(count(p, 'note_search')).toBe(0);
      expect(() => service.get(owner, result.noteId)).toThrow(/not found/);
      expect(() =>
        service.mutate(owner, { ...value, content: content('different') }),
      ).toThrow(/different content/);
      const inspection = new Database(p.storage.databasePath, {
        readonly: true,
      });
      try {
        expect(inspection.pragma('integrity_check', { simple: true })).toBe(
          'ok',
        );
        expect(inspection.pragma('foreign_key_check')).toEqual([]);
      } finally {
        inspection.close();
      }
    }));

  it('serializes concurrent create retries on two connections and binds receipts to action/target/revision', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        value = create();
      const other = new Persistence(p.storage);
      try {
        const outcomes = await Promise.all(
          [service, new NoteService(other)].map((s) =>
            Promise.resolve().then(() => s.mutate(owner, value)),
          ),
        );
        expect(outcomes[0]).toEqual(outcomes[1]);
        expect(count(p, 'notes')).toBe(1);
        const update = edit(outcomes[0].noteId, 1, content('new body'));
        service.mutate(owner, update);
        if (update.action !== 'update') throw new Error('Expected update');
        for (const mismatch of [
          { ...update, expectedRevision: 2 },
          { ...update, noteId: randomUUID() },
          { ...update, action: 'trash' },
          { ...update, action: 'restore' },
        ]) {
          // status-only actions are strict and cannot contain a content field.
          const input =
            mismatch.action === 'trash' || mismatch.action === 'restore'
              ? {
                  action: mismatch.action,
                  noteId: update.noteId,
                  mutationId: update.mutationId,
                  expectedRevision: 1,
                }
              : mismatch;
          expect(() => service.mutate(owner, input)).toThrow(
            /different content/,
          );
        }
      } finally {
        await other.close();
      }
    }));

  it('preserves creation/timeline/location/content timing through drafts and both Trash prior statuses', async () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new NoteService(p);
      const body = {
        ...content(),
        location: {
          latitude: 0,
          longitude: 0,
          accuracy: null,
          label: 'Manual',
        },
      };
      const first = service.mutate(owner, create(body));
      const original = service.get(owner, first.noteId);
      const same = service.mutate(owner, edit(first.noteId, 1, body));
      expect(service.get(owner, first.noteId).contentEditedAt).toBeNull();
      service.mutate(owner, action(first.noteId, same.revision, 'trash'));
      expect(service.get(owner, first.noteId)).toMatchObject({
        status: 'trash',
        priorStatus: 'published',
        timelineAt: original.timelineAt,
        location: body.location,
        createdAt: original.createdAt,
        contentEditedAt: null,
      });
      service.mutate(owner, action(first.noteId, 3, 'restore'));
      expect(service.get(owner, first.noteId).status).toBe('published');
      service.mutate(
        owner,
        edit(first.noteId, 4, { ...body, bodyMarkdown: 'Republished #Work' }),
      );
      const published = service.get(owner, first.noteId);
      expect(published).toMatchObject({
        timelineAt: original.timelineAt,
        createdAt: original.createdAt,
        revision: 5,
      });
      expect(published.contentEditedAt).not.toBeNull();
      service.mutate(owner, action(first.noteId, 5, 'trash'));
      expect(service.get(owner, first.noteId).priorStatus).toBe('published');
      service.mutate(owner, action(first.noteId, 6, 'restore'));
      expect(service.get(owner, first.noteId)).toMatchObject({
        status: 'published',
        contentEditedAt: published.contentEditedAt,
      });
      expect(p.db.select().from(noteSearch).get()?.sourceRevision).toBe(7);
      expect(() =>
        service.mutate(owner, action(first.noteId, 7, 'permanent-delete')),
      ).toThrow(/Trash/);
      expect(() =>
        service.mutate(owner, action(first.noteId, 7, 'restore')),
      ).toThrow(/transition/);
    }));

  it('date/location-only changes do not imply a content edit and null timeline is only a create default', async () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new NoteService(p),
        body = content();
      const created = service.mutate(
        owner,
        create({ ...body, timelineAt: null }),
      );
      const original = service.get(owner, created.noteId);
      expect(original.timelineAt).toBe(original.createdAt);
      service.mutate(
        owner,
        edit(created.noteId, 1, {
          ...body,
          location: { latitude: 90, longitude: -180, accuracy: 0, label: null },
        }),
      );
      expect(service.get(owner, created.noteId)).toMatchObject({
        timelineAt: body.timelineAt,
        createdAt: original.createdAt,
        contentEditedAt: null,
      });
      expect(() =>
        service.mutate(
          owner,
          edit(created.noteId, 2, { ...body, timelineAt: null }),
        ),
      ).toThrow(/original timeline/);
      expect(() =>
        service.mutate(
          owner,
          create({ ...body, timelineAt: Date.now() + 60_000 }),
        ),
      ).toThrow(/now or earlier/);
    }));

  it('one of two connection edits wins and every stale edit/state change gets a safe complete snapshot', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        first = service.mutate(owner, create());
      const other = new Persistence(p.storage);
      try {
        const changes = [
          edit(first.noteId, 1, content('winner #Work')),
          edit(first.noteId, 1, content('loser #Lost')),
        ];
        const outcomes = await Promise.allSettled(
          changes.map((value, i) =>
            Promise.resolve().then(() =>
              (i ? new NoteService(other) : service).mutate(owner, value),
            ),
          ),
        );
        expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(
          1,
        );
        const error = outcomes.find((r) => r.status === 'rejected');
        if (error?.status !== 'rejected') throw new Error('Expected conflict');
        expect(error.reason).toBeInstanceOf(NoteConflictError);
        const response = noteErrorResponse(error.reason);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'conflict',
            conflict: {
              id: first.noteId,
              revision: 2,
              bodyMarkdown: 'winner #Work',
              attachmentIds: [],
              tags: ['work'],
            },
          },
        });
        for (const name of ['trash', 'restore', 'permanent-delete'] as const)
          expect(() =>
            service.mutate(owner, action(first.noteId, 1, name)),
          ).toThrow(NoteConflictError);
        expect(() =>
          service.mutate(
            owner,
            edit(
              first.noteId,
              1,
              content('replace without refreshed revision'),
            ),
          ),
        ).toThrow(NoteConflictError);
        service.mutate(
          owner,
          edit(first.noteId, 2, content('explicit replace')),
        );
        expect(count(p, 'mutation_receipts')).toBe(3);
      } finally {
        await other.close();
      }
    }));

  it('rejects whitespace, invalid tags/locations, unready/unauthorized attachments and broken image references without partial notes', async () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new NoteService(p);
      for (const body of [
        content(' \n\t'),
        content('#' + 'a'.repeat(65)),
        content(`![x](attachment:${randomUUID()})`),
        { ...content(''), attachmentIds: [randomUUID()] },
        {
          ...content(),
          location: {
            latitude: 100,
            longitude: 0,
            accuracy: null,
            label: null,
          },
        },
      ])
        expect(() => service.mutate(owner, create(body))).toThrow();
      const value = create({ ...content(''), attachmentIds: [randomUUID()] });
      if (!('content' in value)) throw new Error('Expected content');
      const uploads = new AttachmentService(p);
      uploads.initialize(owner, {
        mutationId: value.mutationId,
        requestDigest: noteMutationDigest(value),
        items: [
          {
            id: value.content.attachmentIds[0],
            filename: 'pending.txt',
            incomingBytes: 0,
            incomingDigest: createHash('sha256').update('').digest('hex'),
          },
        ],
      });
      expect(() => service.mutate(owner, value)).toThrow(/unready/);
      expect(count(p, 'notes')).toBe(0);
      expect(count(p, 'mutation_receipts')).toBe(0);
    }));

  it('supports image-only and zero-byte file-only notes, committed batch retry and referenced conflict-copy reuse', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        imageId = randomUUID();
      const image = await sharp({
        create: { width: 8, height: 4, channels: 3, background: 'green' },
      })
        .png()
        .toBuffer();
      const value = create({
        ...content(`![image](attachment:${imageId})`),
        attachmentIds: [imageId],
      });
      const uploaded = await upload(p, owner, value, [image]);
      const result = service.mutate(owner, value);
      expect(service.get(owner, result.noteId).attachmentIds).toEqual([
        imageId,
      ]);
      expect(p.db.select().from(uploadBatches).get()?.status).toBe('committed');
      expect(service.mutate(owner, value)).toEqual(result);
      expect(
        uploaded.service.initialize(owner, {
          mutationId: value.mutationId,
          requestDigest: noteMutationDigest(value),
          items: [],
        }),
      ).toEqual({ state: 'confirmed', result });
      const clone = service.mutate(
        owner,
        create({ ...content('Conflict copy'), attachmentIds: [imageId] }),
      );
      const zeroId = randomUUID(),
        zero = create({ ...content(''), attachmentIds: [zeroId] });
      await upload(p, owner, zero, [Buffer.alloc(0)]);
      service.mutate(owner, zero);
      const deleteFirst = action(result.noteId, 2, 'permanent-delete');
      service.mutate(owner, action(result.noteId, 1, 'trash'));
      service.mutate(owner, deleteFirst);
      expect(count(p, 'file_cleanup_jobs')).toBe(0);
      const downloaded = await uploaded.service.download(
        owner,
        imageId,
        'display',
      );
      expect(downloaded.status).toBe(200);
      await downloaded.arrayBuffer();
      service.mutate(owner, action(clone.noteId, 1, 'trash'));
      service.mutate(owner, action(clone.noteId, 2, 'permanent-delete'));
      expect(count(p, 'file_cleanup_jobs')).toBe(1);
      expect(() =>
        service.mutate(
          owner,
          create({ ...content(), attachmentIds: [imageId] }),
        ),
      ).toThrow(/unavailable/);
      await runAttachmentCleanup(p);
      expect(
        existsSync(p.storage.attachmentPath(imageId, 'display.webp')),
      ).toBe(false);
      expect(
        p.db
          .select()
          .from(attachments)
          .where(eq(attachments.id, imageId))
          .get(),
      ).toBeUndefined();
      expect(service.mutate(owner, value)).toEqual(result);
    }));

  it('batch digest/ownership/files and physical ready bytes are checked before linking', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        id = randomUUID();
      const value = create({ ...content('file'), attachmentIds: [id] });
      const uploaded = await upload(p, owner, value, [Buffer.from('bytes')]);
      expect(() =>
        service.mutate(owner, {
          ...value,
          content: content('changed payload'),
        }),
      ).toThrow(/frozen upload/);
      expect(() =>
        service.mutate(
          owner,
          create({ ...content('borrow pending retry'), attachmentIds: [id] }),
        ),
      ).toThrow(/unavailable/);
      p.write((tx) =>
        tx
          .update(uploadBatches)
          .set({ requestDigest: 'a'.repeat(64) })
          .where(eq(uploadBatches.id, uploaded.batch.id))
          .run(),
      );
      expect(() => service.mutate(owner, value)).toThrow(/frozen upload/);
      p.write((tx) =>
        tx
          .update(uploadBatches)
          .set({ requestDigest: noteMutationDigest(value) })
          .where(eq(uploadBatches.id, uploaded.batch.id))
          .run(),
      );
      rmSync(p.storage.attachmentPath(id, 'attachment.bin'));
      expect(() => service.mutate(owner, value)).toThrow(
        /stored attachment is unavailable/,
      );
      expect(count(p, 'notes')).toBe(0);
      expect(count(p, 'mutation_receipts')).toBe(0);
    }));

  it('rejects files used as image references, omitted frozen items and configured attachment overflow', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        ids = [randomUUID(), randomUUID()];
      const value = create({ ...content('two files'), attachmentIds: ids });
      await upload(p, owner, value, [
        Buffer.from('first'),
        Buffer.from('second'),
      ]);
      const result = service.mutate(owner, value);
      expect(() =>
        service.mutate(
          owner,
          create({
            ...content(`![not an image](attachment:${ids[0]})`),
            attachmentIds: [ids[0]],
          }),
        ),
      ).toThrow(/Every Markdown image/);
      p.write((tx) =>
        tx
          .update(appSettings)
          .set({
            valueJson: JSON.stringify({
              ...DEFAULT_SETTINGS,
              maxAttachmentsPerNote: 1,
            }),
          })
          .run(),
      );
      expect(() =>
        service.mutate(
          owner,
          create({ ...content('clone'), attachmentIds: ids }),
        ),
      ).toThrow(/configured/);
      // Response-loss recovery must also work through upload initialization after
      // settings were tightened, before any unnecessary retransmission.
      expect(
        new AttachmentService(p).initialize(owner, {
          mutationId: value.mutationId,
          requestDigest: noteMutationDigest(value),
          items: ids.map((id, i) => {
            const input = Buffer.from(i === 0 ? 'first' : 'second');
            return {
              id,
              filename: `香港-${i}.dat`,
              incomingBytes: input.length,
              incomingDigest: createHash('sha256').update(input).digest('hex'),
            };
          }),
        }),
      ).toEqual({ state: 'confirmed', result });
      p.write((tx) =>
        tx
          .update(appSettings)
          .set({ valueJson: JSON.stringify(DEFAULT_SETTINGS) })
          .run(),
      );
      service.mutate(owner, action(result.noteId, 1, 'trash'));
      expect(count(p, 'file_cleanup_jobs')).toBe(0);
      expect(service.get(owner, result.noteId).attachmentIds).toEqual(ids);
      const nextId = randomUUID(),
        omittedId = randomUUID();
      const next = create({
        ...content('must include batch'),
        attachmentIds: [nextId],
      });
      if (!('content' in next)) throw new Error('Expected content');
      // Extra pending item in the same frozen batch cannot silently vanish at commit.
      const uploads = new AttachmentService(p);
      const manifest = {
        mutationId: next.mutationId,
        requestDigest: noteMutationDigest(next),
        items: [nextId, omittedId].map((id) => ({
          id,
          filename: 'empty.dat',
          incomingBytes: 0,
          incomingDigest: createHash('sha256').update('').digest('hex'),
        })),
      };
      const initialized = uploads.initialize(owner, manifest);
      if (initialized.state !== 'batch') throw new Error('Expected batch');
      await uploads.upload(
        owner,
        initialized.batch.id,
        nextId,
        new Request('http://localhost', {
          method: 'PUT',
          body: new Uint8Array(),
        }),
      );
      expect(() => service.mutate(owner, next)).toThrow(
        /All frozen batch files/,
      );
      expect(count(p, 'notes')).toBe(1);
    }));

  it('receipt insertion failure rolls back note/tags/links/search/batch atomically, leaving ready files retryable', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        id = randomUUID();
      const value = create({ ...content('atomic #New'), attachmentIds: [id] });
      await upload(p, owner, value, [Buffer.from('file')]);
      p.native.exec(
        "CREATE TRIGGER test_fail_receipt BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
      );
      expect(() => service.mutate(owner, value)).toThrow();
      for (const table of [
        'notes',
        'tags',
        'note_tags',
        'note_attachments',
        'note_search',
        'mutation_receipts',
      ])
        expect(count(p, table)).toBe(0);
      expect(p.db.select().from(uploadBatches).get()?.status).toBe('pending');
      expect(existsSync(p.storage.attachmentPath(id, 'attachment.bin'))).toBe(
        true,
      );
      p.native.exec('DROP TRIGGER test_fail_receipt;');
      expect(service.mutate(owner, value).revision).toBe(1);
    }));

  it('removing the final attachment reference queues cleanup atomically and deletion failure cannot commit a partial receipt', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        id = randomUUID();
      const value = create({ ...content('initial'), attachmentIds: [id] });
      await upload(p, owner, value, [Buffer.from('bytes')]);
      const result = service.mutate(owner, value);
      const change = edit(result.noteId, 1, content('updated'));
      p.native.exec(
        "CREATE TRIGGER test_fail_receipt BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
      );
      expect(() => service.mutate(owner, change)).toThrow();
      expect(service.get(owner, result.noteId)).toMatchObject({
        revision: 1,
        attachmentIds: [id],
      });
      expect(count(p, 'file_cleanup_jobs')).toBe(0);
      p.native.exec('DROP TRIGGER test_fail_receipt;');
      service.mutate(owner, change);
      expect(count(p, 'file_cleanup_jobs')).toBe(1);
      expect(service.get(owner, result.noteId).contentEditedAt).not.toBeNull();
      const trashed = service.mutate(owner, action(result.noteId, 2, 'trash'));
      const deletion = action(
        result.noteId,
        trashed.revision,
        'permanent-delete',
      );
      p.native.exec(
        "CREATE TRIGGER test_fail_receipt BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
      );
      expect(() => service.mutate(owner, deletion)).toThrow();
      expect(service.get(owner, result.noteId).status).toBe('trash');
      expect(
        p.db
          .select()
          .from(mutationReceipts)
          .where(eq(mutationReceipts.mutationId, deletion.mutationId))
          .get(),
      ).toBeUndefined();
      p.native.exec('DROP TRIGGER test_fail_receipt;');
      service.mutate(owner, deletion);
    }));

  it('settings bounds, stale tags, revoked sessions and maintenance fail closed; receipts stay private', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        service = new NoteService(p),
        value = create();
      const result = service.mutate(owner, value);
      p.write((tx) =>
        tx
          .update(appSettings)
          .set({
            valueJson: JSON.stringify({
              ...DEFAULT_SETTINGS,
              markdownMaxBytes: 4,
            }),
          })
          .run(),
      );
      expect(service.mutate(owner, value)).toEqual(result); // receipt before new settings validation
      expect(() => service.mutate(owner, create(content('long body')))).toThrow(
        /configured/,
      );
      p.write((tx) =>
        tx
          .update(appSettings)
          .set({ valueJson: JSON.stringify(DEFAULT_SETTINGS) })
          .run(),
      );
      p.write((tx) =>
        tx
          .insert(tagChanges)
          .values({
            oldKey: 'retired',
            action: 'remove',
            targetKey: null,
            createdAt: Date.now(),
          })
          .run(),
      );
      expect(() => service.mutate(owner, create(content('#Retired')))).toThrow(
        /retired tag/,
      );
      await p.coordinator.exclusive(async () => {
        expect(() => service.mutate(owner, create())).toThrow(/maintenance/i);
      });
      p.write((tx) => tx.update(sessions).set({ revokedAt: Date.now() }).run());
      expect(() => service.mutate(owner, value)).toThrow(/Sign in/);
      expect(() => service.get(owner, result.noteId)).toThrow(/Sign in/);
    }));

  it('ready file references and receipts survive reopen; queued deletion can resume on startup', async () =>
    withPersistence(async (p) => {
      const owner = identity(p),
        id = randomUUID(),
        value = create({ ...content('restart'), attachmentIds: [id] });
      await upload(p, owner, value, [Buffer.from('persisted')]);
      const result = new NoteService(p).mutate(owner, value);
      await p.close();
      const reopened = new Persistence(p.storage);
      try {
        const service = new NoteService(reopened);
        expect(service.mutate(owner, value)).toEqual(result);
        expect(service.get(owner, result.noteId).attachmentIds).toEqual([id]);
        service.mutate(owner, action(result.noteId, 1, 'trash'));
        service.mutate(owner, action(result.noteId, 2, 'permanent-delete'));
      } finally {
        await reopened.close();
      }
      const recovered = new Persistence(p.storage);
      try {
        await runAttachmentCleanup(recovered);
        expect(recovered.db.select().from(fileCleanupJobs).all()).toEqual([]);
        expect(recovered.db.select().from(noteAttachments).all()).toEqual([]);
        expect(recovered.db.select().from(notes).all()).toEqual([]);
        expect(new NoteService(recovered).mutate(owner, value)).toEqual(result);
      } finally {
        await recovered.close();
      }
    }));
});
