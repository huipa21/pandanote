import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedAccount, withPersistence } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { notes, sessions } from '../../src/lib/server/db/schema.ts';
import { timelinePage } from '../../src/lib/server/notes/timeline.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { MAX_PINNED_NOTES } from '../../src/lib/shared/notes.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3_600_000,
    sessionHash = 'b'.repeat(64);
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
    expiresAt,
    securityRevision: 1,
  };
}
const day = 86_400_000;
function create(
  service: NoteService,
  who: SessionIdentity,
  body: string,
  ageDays: number,
) {
  return service.mutate(who, {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: body,
      timelineAt: Date.now() - ageDays * day,
      attachmentIds: [],
    },
  });
}
const act = (
  service: NoteService,
  who: SessionIdentity,
  name: 'pin' | 'unpin' | 'trash' | 'restore',
  noteId: string,
  expectedRevision: number,
  mutationId: string = randomUUID(),
) =>
  service.mutate(who, { action: name, noteId, expectedRevision, mutationId });
const rowOf = (p: Persistence, id: string) =>
  p.db.select().from(notes).where(eq(notes.id, id)).get()!;

describe('pinned notes with actual SQLite', () => {
  it('pins and unpins with one revision, receipts, no content edit time and stale-revision conflicts', async () => {
    await withPersistence(async (p) => {
      const who = owner(p),
        service = new NoteService(p);
      const note = create(service, who, 'pin me', 5);
      const before = rowOf(p, note.noteId);
      const mutationId = randomUUID();
      const pinned = act(service, who, 'pin', note.noteId, 1, mutationId);
      expect(pinned).toMatchObject({ revision: 2, status: 'published' });
      const row = rowOf(p, note.noteId);
      expect(row.pinnedAt).toBeGreaterThan(0);
      expect(row.contentEditedAt).toBeNull();
      expect(row.timelineAt).toBe(before.timelineAt);
      expect(service.get(who, note.noteId).pinnedAt).toBe(row.pinnedAt);
      // Same mutation ID replays the original receipt, no second revision.
      expect(act(service, who, 'pin', note.noteId, 1, mutationId)).toEqual(
        pinned,
      );
      expect(rowOf(p, note.noteId).revision).toBe(2);
      // Stale revision and invalid transitions fail.
      expect(() => act(service, who, 'unpin', note.noteId, 1)).toThrow(
        /changed/,
      );
      expect(() => act(service, who, 'pin', note.noteId, 2)).toThrow(
        /unpinned published/,
      );
      const unpinned = act(service, who, 'unpin', note.noteId, 2);
      expect(unpinned.revision).toBe(3);
      expect(rowOf(p, note.noteId).pinnedAt).toBeNull();
      expect(() => act(service, who, 'unpin', note.noteId, 3)).toThrow(
        /not pinned/,
      );
    });
  });
  it('limits pins, and trash/restore clear the pin and the database rejects pinned Trash rows', async () => {
    await withPersistence(async (p) => {
      const who = owner(p),
        service = new NoteService(p);
      const ids: string[] = [];
      for (let i = 0; i < MAX_PINNED_NOTES + 1; i++) {
        const made = create(service, who, `note ${i}`, i + 1);
        ids.push(made.noteId);
        if (i < MAX_PINNED_NOTES) act(service, who, 'pin', made.noteId, 1);
      }
      expect(() => act(service, who, 'pin', ids.at(-1)!, 1)).toThrow(
        'You can pin at most 20 notes. Unpin one first.',
      );
      const trashed = act(service, who, 'trash', ids[0], 2);
      expect(rowOf(p, ids[0])).toMatchObject({
        status: 'trash',
        pinnedAt: null,
        revision: 3,
      });
      expect(() => act(service, who, 'pin', ids[0], 3)).toThrow(
        /unpinned published/,
      );
      const restored = act(service, who, 'restore', ids[0], trashed.revision);
      expect(restored.status).toBe('published');
      expect(rowOf(p, ids[0]).pinnedAt).toBeNull();
      // The 21st pin now succeeds because the trashed note freed a slot.
      expect(act(service, who, 'pin', ids.at(-1)!, 1).revision).toBe(2);
      expect(() =>
        p.write((tx) =>
          tx
            .update(notes)
            .set({
              status: 'trash',
              priorStatus: 'published',
              revision: rowOf(p, ids[1]).revision + 1,
            })
            .where(eq(notes.id, ids[1]))
            .run(),
        ),
      ).toThrow(/note_pinned_check|CHECK/);
    });
  });
  it('shows pinned notes only at the top of the plain timeline and in place elsewhere', async () => {
    await withPersistence(async (p) => {
      const who = owner(p),
        service = new NoteService(p);
      const params = (query = '') => new URLSearchParams(query);
      const old = create(service, who, '#work old', 70);
      const mid = create(service, who, '#work middle', 40);
      const recent = create(service, who, 'recent', 1);
      act(service, who, 'pin', old.noteId, 1);
      act(service, who, 'pin', mid.noteId, 1);
      const plain = await timelinePage(p, who, params());
      expect(plain.pinned?.map((n) => n.id)).toEqual([mid.noteId, old.noteId]);
      expect(plain.pinned?.every((n) => n.pinnedAt !== null)).toBe(true);
      expect(plain.items.map((n) => n.id)).toEqual([recent.noteId]);
      expect(plain.pinned?.[0].rendered).toBeTruthy();
      for (const query of [
        'tag=work',
        'q=work',
        `month=${new Date(Date.now() - 40 * day).toISOString().slice(0, 7)}`,
      ]) {
        const page = await timelinePage(p, who, params(query));
        expect(page.pinned).toBeUndefined();
        expect(
          page.items.some((n) => n.id === old.noteId || n.id === mid.noteId),
        ).toBe(true);
      }
      const tagged = await timelinePage(p, who, params('tag=work'));
      expect(tagged.items.map((n) => n.id)).toEqual([mid.noteId, old.noteId]);
      expect(tagged.items.every((n) => n.pinnedAt !== null)).toBe(true);
      // No pinned notes: no `pinned` entries at all.
      act(service, who, 'unpin', old.noteId, 2);
      act(service, who, 'trash', mid.noteId, 2);
      const after = await timelinePage(p, who, params());
      expect(after.pinned).toEqual([]);
      expect(after.items.map((n) => n.id)).toEqual([recent.noteId, old.noteId]);
    });
  });
  it('later cursor pages carry no pinned list and never duplicate or skip notes', async () => {
    await withPersistence(async (p) => {
      const who = owner(p),
        service = new NoteService(p);
      const made: string[] = [];
      for (let i = 0; i < 6; i++)
        made.push(create(service, who, `n${i}`, i + 1).noteId);
      act(service, who, 'pin', made[2], 1);
      const seen: string[] = [];
      let cursor: string | null = null;
      let first = true;
      do {
        const page = await timelinePage(
          p,
          who,
          new URLSearchParams({ limit: '2', ...(cursor ? { cursor } : {}) }),
        );
        expect(page.pinned !== undefined).toBe(first);
        if (first) expect(page.pinned!.map((n) => n.id)).toEqual([made[2]]);
        first = false;
        seen.push(...page.items.map((n) => n.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(made.filter((id) => id !== made[2]));
    });
  });
});
