import { and, eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import {
  account,
  attachments,
  notes,
  noteAttachments,
  noteTags,
  tags,
  noteSearch,
  mutationReceipts,
} from '../../src/lib/server/db/schema.ts';
import { newPrivateId } from '../../src/lib/server/storage/private-storage.ts';
import {
  findReceipt,
  insertReceipt,
} from '../../src/lib/server/db/receipts.ts';
import { enqueueAttachmentCleanup } from '../../src/lib/server/maintenance/cleanup.ts';
import {
  readSettings,
  replaceSettings,
} from '../../src/lib/server/settings/repository.ts';
import {
  seedAccount,
  seedAttachment,
  seedNote,
  testDigest,
  withPersistence,
} from '../helpers/persistence.ts';

it('enforces single account, note statuses, paired finite location and revision/creation invariants in SQLite', async () => {
  await withPersistence((p) => {
    seedAccount(p);
    expect(() =>
      p.write((tx) =>
        tx
          .insert(account)
          .values({
            id: newPrivateId(),
            username: 'second-fixture',
            email: 'second@example.invalid',
            passwordHash: 'synthetic',
            createdAt: 1,
          })
          .run(),
      ),
    ).toThrow();
    const id = seedNote(p);
    for (const statement of [
      "status = 'invalid'",
      "status = 'trash'",
      "prior_status = 'draft'",
      'latitude = 91, longitude = 0',
      'latitude = 0',
      'longitude = 0',
      'latitude = 0, longitude = 181',
      'latitude = 0, longitude = 0, accuracy = -1',
      'accuracy = 0',
      "location_label = 'without coordinates'",
      `latitude = 0, longitude = 0, location_label = '${'a'.repeat(201)}'`,
      'latitude = 0, longitude = 0, accuracy = 1e999',
      'timeline_at = 1.5',
    ]) {
      expect(
        () =>
          p.native
            .prepare(
              `UPDATE notes SET ${statement}, revision = revision + 1 WHERE id = ?`,
            )
            .run(id),
        statement,
      ).toThrow();
    }
    for (const statement of [
      'created_at = created_at + 1, revision = revision + 1',
      'revision = 1',
      'revision = 3',
      'revision = 1.5',
    ])
      expect(() =>
        p.native.prepare(`UPDATE notes SET ${statement} WHERE id = ?`).run(id),
      ).toThrow();
    p.write((tx) =>
      tx
        .update(notes)
        .set({
          latitude: -90,
          longitude: 180,
          accuracy: null,
          locationLabel: null,
          revision: 2,
        })
        .where(eq(notes.id, id))
        .run(),
    );
    const first = p.write((tx) =>
      tx
        .update(notes)
        .set({ status: 'trash', priorStatus: 'published', revision: 3 })
        .where(and(eq(notes.id, id), eq(notes.revision, 2)))
        .run(),
    );
    const stale = p.write((tx) =>
      tx
        .update(notes)
        .set({ status: 'published', priorStatus: null, revision: 3 })
        .where(and(eq(notes.id, id), eq(notes.revision, 2)))
        .run(),
    );
    expect(first.changes).toBe(1);
    expect(stale.changes).toBe(0);
    const inspector = new Database(p.storage.databasePath, { readonly: true });
    try {
      expect(
        inspector
          .prepare(
            'SELECT revision, status, content_edited_at FROM notes WHERE id = ?',
          )
          .get(id),
      ).toEqual({ revision: 3, status: 'trash', content_edited_at: null });
      expect(inspector.pragma('foreign_key_check')).toEqual([]);
    } finally {
      inspector.close();
    }
  });
});

it('rejects broken/unready references and protects shared/Trash files until all references are removed', async () => {
  await withPersistence((p) => {
    const one = seedNote(p);
    const two = seedNote(p, 'trash');
    const file = seedAttachment(p);
    const pending = seedAttachment(p, 'pending');
    const link = (noteId: string, attachmentId: string, ordinal = 0) =>
      p.write((tx) =>
        tx
          .insert(noteAttachments)
          .values({ noteId, attachmentId, ordinal })
          .run(),
      );
    expect(() => link(one, newPrivateId())).toThrow();
    expect(() => link(newPrivateId(), file)).toThrow();
    expect(() => link(one, pending)).toThrow();
    link(one, file);
    link(two, file);
    expect(() => link(one, file)).toThrow();
    expect(() => link(one, seedAttachment(p), 0)).toThrow();
    expect(() =>
      p.write((tx) =>
        tx
          .update(attachments)
          .set({ readiness: 'failed' })
          .where(eq(attachments.id, file))
          .run(),
      ),
    ).toThrow();
    expect(() =>
      p.write((tx) =>
        tx.delete(attachments).where(eq(attachments.id, file)).run(),
      ),
    ).toThrow();
    expect(() => p.write((tx) => enqueueAttachmentCleanup(tx, file))).toThrow(
      /referenced/,
    );
    p.write((tx) => tx.delete(notes).where(eq(notes.id, one)).run());
    expect(() => p.write((tx) => enqueueAttachmentCleanup(tx, file))).toThrow(
      /referenced/,
    );
    p.write((tx) => tx.delete(notes).where(eq(notes.id, two)).run());
    let rolledBackId = '';
    expect(() =>
      p.write((tx) => {
        rolledBackId = enqueueAttachmentCleanup(tx, file);
        throw new Error('failure before commit');
      }),
    ).toThrow();
    expect(
      p.native
        .prepare('SELECT id FROM file_cleanup_jobs WHERE id = ?')
        .get(rolledBackId),
    ).toBeUndefined();
    const jobId = p.write((tx) => enqueueAttachmentCleanup(tx, file));
    expect(p.write((tx) => enqueueAttachmentCleanup(tx, file))).toBe(jobId);
    expect(() => link(seedNote(p), file)).toThrow(/available/);
    expect(
      p.native
        .prepare('SELECT state FROM file_cleanup_jobs WHERE id = ?')
        .get(jobId),
    ).toEqual({ state: 'pending' });
    expect(p.native.pragma('foreign_key_check')).toEqual([]);
  });
});

it('keeps joins/search/receipt and content atomic; receipts detect mismatched retries and survive note deletion', async () => {
  await withPersistence((p) => {
    const accountId = seedAccount(p);
    const noteId = newPrivateId();
    const mutationId = newPrivateId();
    const tagId = newPrivateId();
    const fileId = seedAttachment(p);
    const result = {
      noteId,
      revision: 1,
      status: 'published' as const,
      deleted: false,
    };
    const commit = (fail: boolean) =>
      p.write((tx) => {
        expect(findReceipt(tx, accountId, mutationId, testDigest)).toBeNull();
        tx.insert(notes)
          .values({
            id: noteId,
            bodyMarkdown: 'synthetic #work',
            status: 'published',
            timelineAt: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .run();
        tx.insert(tags)
          .values({ id: tagId, normalizedKey: 'work', display: 'Work' })
          .run();
        tx.insert(noteTags).values({ noteId, tagId }).run();
        tx.insert(noteAttachments)
          .values({ noteId, attachmentId: fileId, ordinal: 0 })
          .run();
        tx.insert(noteSearch)
          .values({
            noteId,
            bodyNormalized: 'synthetic #work',
            tagFieldsJson: '["work"]',
            filenameFieldsJson: '["file.txt"]',
            sourceRevision: 1,
          })
          .run();
        insertReceipt(tx, accountId, mutationId, testDigest, result);
        if (fail) throw new Error('simulated failure');
      });
    expect(() => commit(true)).toThrow(/failure/);
    for (const table of [
      'notes',
      'tags',
      'note_tags',
      'note_attachments',
      'note_search',
      'mutation_receipts',
    ])
      expect(
        p.native.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
      ).toEqual({ n: 0 });
    commit(false);
    expect(
      p.write((tx) => findReceipt(tx, accountId, mutationId, testDigest)),
    ).toEqual(result);
    expect(() =>
      p.write((tx) => findReceipt(tx, accountId, mutationId, 'b'.repeat(64))),
    ).toThrow(/different content/);
    expect(() =>
      p.write((tx) =>
        insertReceipt(tx, accountId, mutationId, testDigest, result),
      ),
    ).toThrow();
    expect(() =>
      p.write((tx) =>
        tx
          .insert(tags)
          .values({
            id: newPrivateId(),
            normalizedKey: 'work',
            display: 'work',
          })
          .run(),
      ),
    ).toThrow();
    expect(() =>
      p.write((tx) => tx.insert(noteTags).values({ noteId, tagId }).run()),
    ).toThrow();
    p.write((tx) => tx.delete(notes).where(eq(notes.id, noteId)).run());
    expect(p.db.select().from(noteSearch).all()).toEqual([]);
    expect(p.db.select().from(noteTags).all()).toEqual([]);
    expect(p.db.select().from(noteAttachments).all()).toEqual([]);
    expect(p.db.select().from(mutationReceipts).all()).toHaveLength(1);
    expect(
      p.write((tx) => findReceipt(tx, accountId, mutationId, testDigest)),
    ).toEqual(result);
  });
});

it('routes persistent settings mutations through maintenance and rejects invalid settings without replacement', async () => {
  await withPersistence(async (p) => {
    const original = readSettings(p);
    expect(() =>
      replaceSettings(p, { ...original, fileMaxBytes: -1 }),
    ).toThrow();
    expect(readSettings(p)).toEqual(original);
    await p.coordinator.exclusive(async (lease) => {
      expect(() => replaceSettings(p, { ...original, theme: 'dark' })).toThrow(
        /Maintenance/,
      );
      p.write(
        (tx) =>
          tx
            .insert(tags)
            .values({
              id: newPrivateId(),
              normalizedKey: 'maintenance',
              display: 'maintenance',
            })
            .run(),
        lease,
      );
    });
    expect(p.db.select().from(tags).all()).toHaveLength(1);
  });
});
