import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedAccount, withPersistence } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import {
  notes,
  tags,
  noteTags,
  sessions,
} from '../../src/lib/server/db/schema.ts';
import {
  timelinePage,
  publishedTags,
  decodeCursor,
  encodeCursor,
} from '../../src/lib/server/notes/timeline.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import {
  CARD_SOURCE_BYTES,
  PAGE_SOURCE_BYTES,
} from '../../src/lib/shared/timeline.ts';

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
const params = (query = '') => new URLSearchParams(query);

describe('published timeline with actual SQLite', () => {
  it('filters identities expanded by NFKC, including spaces, without imposing new source-tag rules', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      for (const spelling of ['ﷺ', 'ﬃ'.repeat(20)]) {
        const result = service.mutate(identity, {
          action: 'create',
          mutationId: randomUUID(),
          content: {
            bodyMarkdown: `#${spelling}`,
            timelineAt: 1_700_000_000_000,
            location: null,
            attachmentIds: [],
          },
        });
        const page = await timelinePage(
          p,
          identity,
          new URLSearchParams({
            tag: spelling.normalize('NFKC').toLowerCase(),
          }),
        );
        expect(page.items.map((n) => n.id)).toEqual([result.noteId]);
      }
    });
  });
  it('paginates timestamp ties with no duplicates/skips and canonical filter-bound cursors', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      const ids = [];
      for (let n = 0; n < 75; n++)
        ids.push(
          service.mutate(identity, {
            action: 'create',
            mutationId: randomUUID(),
            content: {
              bodyMarkdown: `${n} #Work ${n % 2 ? '#香港' : ''}`,
              timelineAt: 1_700_000_000_000,
              location: null,
              attachmentIds: [],
            },
          }).noteId,
        );
      const first = await timelinePage(p, identity, params());
      expect(first.items).toHaveLength(30);
      const second = await timelinePage(
        p,
        identity,
        params(`cursor=${first.nextCursor}`),
      );
      const third = await timelinePage(
        p,
        identity,
        params(`cursor=${second.nextCursor}`),
      );
      expect(third.nextCursor).toBeNull();
      expect(
        [...first.items, ...second.items, ...third.items].map((n) => n.id),
      ).toEqual(ids.sort().reverse());
      const filtered = await timelinePage(
        p,
        identity,
        params('tag=香港&limit=10'),
      );
      expect(filtered.anchor).toBeNull();
      expect(filtered.items).toHaveLength(10);
      expect(filtered.items.every((n) => n.tags.includes('香港'))).toBe(true);
      const next = await timelinePage(
        p,
        identity,
        params(`tag=香港&cursor=${filtered.nextCursor}`),
      );
      expect(next.items).toHaveLength(27);
      await expect(
        timelinePage(
          p,
          identity,
          params(`tag=work&cursor=${filtered.nextCursor}`),
        ),
      ).rejects.toThrow('different filters');
      await expect(
        timelinePage(p, identity, params(`tag=work&tag=香港&limit=10`)),
      ).rejects.toThrow('Select only one tag.');
      await expect(
        timelinePage(p, identity, params('cursor=invalid')),
      ).rejects.toThrow('Invalid timeline cursor');
      const wrongZone = decodeCursor(first.nextCursor!);
      wrongZone.timezone = 'Asia/Tokyo';
      await expect(
        timelinePage(p, identity, params(`cursor=${encodeCursor(wrongZone)}`)),
      ).rejects.toThrow('different filters');
    });
  });
  it('excludes drafts/Trash, updates revisions/tags atomically and rejects expired access', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      const create = (text: string) =>
        service.mutate(identity, {
          action: 'create',
          mutationId: randomUUID(),
          content: {
            bodyMarkdown: text,
            timelineAt: 1_700_000_000_000,
            location: null,
            attachmentIds: [],
          },
        });
      const a = create('#Work first'),
        b = create('#Work draft'),
        c = create('#Work trash');
      service.mutate(identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: b.noteId,
        expectedRevision: 1,
      });
      service.mutate(identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: c.noteId,
        expectedRevision: 1,
      });
      expect(
        (await timelinePage(p, identity, params())).items.map((n) => n.id),
      ).toEqual([a.noteId]);
      expect(publishedTags(p, identity).map((t) => [t.key, t.count])).toEqual([
        ['work', 1],
      ]);
      service.mutate(identity, {
        action: 'update',
        noteId: a.noteId,
        expectedRevision: 1,
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: '#図書館 edited',
          timelineAt: 1_600_000_000_000,
          location: {
            latitude: 1,
            longitude: 2,
            accuracy: null,
            label: 'Synthetic',
          },
          attachmentIds: [],
        },
      });
      const edited = (await timelinePage(p, identity, params('tag=図書館')))
        .items[0];
      expect(edited.revision).toBe(2);
      expect(edited.contentEditedAt).not.toBeNull();
      expect(edited.location?.label).toBe('Synthetic');
      expect(
        (await timelinePage(p, identity, params('tag=work'))).items,
      ).toEqual([]);
      p.write((tx) =>
        tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, identity.sessionHash))
          .run(),
      );
      await expect(timelinePage(p, identity, params())).rejects.toThrow();
      expect(() => publishedTags(p, identity)).toThrow();
    });
  });
  it('bounds long Unicode source/page payloads without losing a pagination boundary; SSR HTML stays sanitized', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      p.write((tx) => {
        for (let i = 0; i < 40; i++)
          tx.insert(notes)
            .values({
              id: randomUUID(),
              bodyMarkdown:
                '<script>alert(1)</script>\n\n' + '香港😊'.repeat(10_000),
              status: 'published',
              timelineAt: 100,
              createdAt: 100,
              updatedAt: 100,
              revision: 1,
            })
            .run();
      });
      const first = await timelinePage(p, identity, params('limit=100'));
      expect(first.items.length).toBeLessThan(100);
      expect(
        first.items.every(
          (n) =>
            n.bodyTruncated &&
            Buffer.byteLength(n.bodyMarkdown) <= CARD_SOURCE_BYTES &&
            !n.rendered.html.includes('<script>'),
        ),
      ).toBe(true);
      expect(
        first.items.reduce(
          (n, row) => n + Buffer.byteLength(row.bodyMarkdown),
          0,
        ),
      ).toBeLessThanOrEqual(PAGE_SOURCE_BYTES);
      const second = await timelinePage(
        p,
        identity,
        params(`limit=100&cursor=${first.nextCursor}`),
      );
      expect(
        new Set([...first.items, ...second.items].map((n) => n.id)).size,
      ).toBe(40);
      expect(second.nextCursor).toBeNull();
    });
  });
  it('10k multilingual notes fetch/render only the bounded page and records warm query/SSR timings', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        now = Date.now();
      p.write((tx) => {
        const tagId = randomUUID();
        tx.insert(tags)
          .values({ id: tagId, normalizedKey: 'work', display: 'Work' })
          .run();
        for (let i = 0; i < 10_000; i++) {
          const id = randomUUID();
          tx.insert(notes)
            .values({
              id,
              bodyMarkdown:
                `Synthetic ${i} 香港 図書館 数据库 #Work\n\n` +
                'A quiet synthetic memory. '.repeat(75),
              status: 'published',
              timelineAt: now - i * 3_600_000,
              createdAt: now,
              updatedAt: now,
              revision: 1,
            })
            .run();
          tx.insert(noteTags).values({ noteId: id, tagId }).run();
        }
      });
      const samples = [],
        payload = await timelinePage(p, identity, params());
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await timelinePage(p, identity, params('tag=work'));
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      expect(payload.items).toHaveLength(30);
      expect(payload.nextCursor).not.toBeNull();
      expect(JSON.stringify(payload).length).toBeLessThan(300_000);
      const queryPlan = p.native
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM notes WHERE status='published' AND timeline_at < ? ORDER BY timeline_at DESC, id DESC LIMIT 31",
        )
        .all(now + 1) as { detail: string }[];
      expect(queryPlan.some((r) => r.detail.includes('INDEX'))).toBe(true);
      process.stdout.write(
        `S09 10k notes: page=${Buffer.byteLength(JSON.stringify(payload))} bytes; warm tag query+render p50=${samples[5].toFixed(1)}ms p95=${samples[9].toFixed(1)}ms; only 30 cards returned.\n`,
      );
    });
  });
});
