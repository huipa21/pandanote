import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { sessions } from '../../src/lib/server/db/schema.ts';
import { statusPage } from '../../src/lib/server/notes/status-list.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import type { NoteMutation } from '../../src/lib/shared/notes.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3600000,
    sessionHash = 'c'.repeat(64);
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        createdAt: Date.now(),
        expiresAt,
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
const create = (bodyMarkdown: string): NoteMutation => ({
  action: 'create',
  mutationId: randomUUID(),
  content: {
    bodyMarkdown,
    attachmentIds: [],
    timelineAt: Date.UTC(2021, 4, 1),
  },
});
const params = (extra: Record<string, string>) =>
  new URLSearchParams({ status: 'trash', ...extra });

describe('Trash search with real SQLite', () => {
  it('searches only Trash, with AND terms, tags, stable pages and query-bound cursors', () =>
    withPersistence((p) => {
      const identity = owner(p),
        service = new NoteService(p);
      const trash = (body: string) => {
        const note = service.mutate(identity, create(body));
        service.mutate(identity, {
          action: 'trash',
          mutationId: randomUUID(),
          noteId: note.noteId,
          expectedRevision: 1,
        });
        return note.noteId;
      };
      // Active (published) notes must never appear in Trash search.
      service.mutate(identity, create('needle published active'));
      const work = trash('needle in trash #Work');
      const other = trash('plain needle only');
      for (let n = 0; n < 12; n++) trash(`bulk needle ${n}`);
      trash('unrelated text');

      const all = statusPage(p, identity, params({ q: 'NEEDLE' }));
      expect(all.items).toHaveLength(14);

      const both = statusPage(p, identity, params({ q: 'needle work' }));
      expect(both.items.map((n) => n.id)).toEqual([work]);
      expect(both.items[0].tags).toEqual(['work']);

      const tagged = statusPage(p, identity, params({ q: 'WORK' }));
      expect(tagged.items.map((n) => n.id)).toEqual([work]);

      const phrase = statusPage(p, identity, params({ q: '"plain needle"' }));
      expect(phrase.items.map((n) => n.id)).toEqual([other]);

      expect(
        statusPage(p, identity, params({ q: 'published' })).items,
      ).toHaveLength(0);

      // Paging a search (10 at a time) yields every match exactly once.
      const first = statusPage(
        p,
        identity,
        params({ q: 'needle', limit: '10' }),
      );
      expect(first.items).toHaveLength(10);
      expect(first.nextCursor).not.toBeNull();
      const second = statusPage(
        p,
        identity,
        params({ q: 'needle', limit: '10', cursor: first.nextCursor! }),
      );
      expect(second.items).toHaveLength(4);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((n) => n.id);
      expect(new Set(ids).size).toBe(14);

      // A cursor is valid only for the query that produced it.
      expect(() =>
        statusPage(
          p,
          identity,
          params({ q: 'other', limit: '10', cursor: first.nextCursor! }),
        ),
      ).toThrow('Invalid cursor');
      expect(() =>
        statusPage(
          p,
          identity,
          params({ limit: '10', cursor: first.nextCursor! }),
        ),
      ).toThrow('Invalid cursor');
    }));
});
