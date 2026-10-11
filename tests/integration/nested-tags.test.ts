import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedAccount, withPersistence } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import {
  notes,
  noteTags,
  sessions,
  tagChanges,
  tags,
} from '../../src/lib/server/db/schema.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import {
  publishedTags,
  timelinePage,
} from '../../src/lib/server/notes/timeline.ts';
import { TagService } from '../../src/lib/server/tags/service.ts';
import type { TagAction } from '../../src/lib/shared/tags.ts';
import { flattenTagTree } from '../../src/lib/shared/tag-tree.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3_600_000,
    sessionHash = 'd'.repeat(64);
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
function create(n: NoteService, id: SessionIdentity, body: string, at = 1000) {
  return n.mutate(id, {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: body,
      timelineAt: at,
      location: null,
      attachmentIds: [],
    },
  }).noteId;
}
function execute(t: TagService, id: SessionIdentity, operation: TagAction) {
  const preview = t.preview(id, operation);
  return {
    preview,
    result: t.execute(id, {
      mutationId: randomUUID(),
      operation,
      previewToken: preview.previewToken,
      confirmed: true,
    }),
  };
}
async function ids(p: Persistence, id: SessionIdentity, query: string) {
  return (await timelinePage(p, id, new URLSearchParams(query))).items
    .map((item) => item.id)
    .sort();
}

describe('NT nested tags with actual SQLite', () => {
  it('NT-COUNT/NT-FILTER: subtree filters, distinct parent counts and count-ordered tree', async () =>
    withPersistence(async (p) => {
      const id = owner(p),
        n = new NoteService(p);
      const n1 = create(n, id, '#work', 1001),
        n2 = create(n, id, '#Work/Meeting', 1002),
        n3 = create(n, id, '#work #work/meeting', 1003),
        n4 = create(n, id, '#home', 1004),
        n5 = create(n, id, '#work/x #axb/c', 1005);
      n.mutate(id, {
        action: 'trash',
        noteId: n5,
        expectedRevision: 1,
        mutationId: randomUUID(),
      });
      const tree = publishedTags(p, id);
      expect(tree.map((t) => [t.key, t.count])).toEqual([
        ['work', 3],
        ['home', 1],
      ]);
      expect(tree[0].children.map((t) => [t.key, t.label, t.count])).toEqual([
        ['work/meeting', 'Meeting', 2],
      ]);
      expect(await ids(p, id, 'tag=work')).toEqual([n1, n2, n3].sort());
      expect(await ids(p, id, 'tag=Work/Meeting')).toEqual([n2, n3].sort());
      expect(await ids(p, id, 'tag=work&tag=home')).toEqual([]);
      expect(await ids(p, id, 'tag=wor')).toEqual([]);
      expect(await ids(p, id, 'tag=work/x')).toEqual([]); // Trash excluded
      // Search on a subtag segment still finds the full key.
      expect(await ids(p, id, 'q=meeting&tag=work')).toEqual([n2, n3].sort());
      // `_` is literal in the range predicate (no LIKE wildcard).
      n.mutate(id, {
        action: 'restore',
        noteId: n5,
        expectedRevision: 2,
        mutationId: randomUUID(),
      });
      const n6 = create(n, id, '#a_b/c', 1006);
      expect(await ids(p, id, 'tag=a_b')).toEqual([n6]);
      expect(await ids(p, id, 'tag=axb')).toEqual([n5]);
      const counts = new Map(
        flattenTagTree(publishedTags(p, id)).map((t) => [t.key, t.count]),
      );
      expect(counts.get('work')).toBe(4);
      expect(counts.get('axb')).toBe(1);
      expect(counts.get('a_b')).toBe(1);
      expect(n4).toBeTruthy();
    }));

  it('NT-BASE: fresh baseline stores 128-character paths and validates scoped history', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p);
      const long = 'x'.repeat(64) + '/' + 'y'.repeat(63);
      create(n, id, `#${long}`);
      expect(
        p.db
          .select()
          .from(tags)
          .all()
          .map((t) => t.normalizedKey),
      ).toEqual([long]);
      expect(() =>
        p.native
          .prepare(
            "insert into tags(id, normalized_key, display) values ('t1', ?, ?)",
          )
          .run('z'.repeat(129), 'z'),
      ).toThrow(/CHECK/);
      const insert = (action: string, target: string | null, scope: string) =>
        p.native
          .prepare(
            'insert into tag_changes(old_key, action, target_key, scope, created_at) values (?,?,?,?,1)',
          )
          .run('k', action, target, scope);
      expect(() => insert('rename', 'j', 'exact')).toThrow(/CHECK/);
      expect(() => insert('remove', null, 'other')).toThrow(/CHECK/);
      insert('remove', null, 'exact');
      insert('rename', 'j', 'subtree');
      expect(p.db.select().from(tagChanges).all()).toHaveLength(2);
      expect(() => create(n, id, '#a/b/c/d/e/f')).toThrow(/5 levels|limits/);
    }));

  it('NT-MANAGE: subtree rename keeps suffix spelling, refuses moves into itself and needs merge for collisions', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      const a = create(n, id, 'x #Work/Meeting and #work `#work/meeting`'),
        b = create(n, id, '#work/Meeting/2026 #home');
      const list = t.list(id);
      expect(
        list.map((r) => [r.key, r.depth, r.explicit, r.published]),
      ).toEqual([
        ['home', 1, true, 1],
        ['work', 1, true, 2],
        ['work/meeting', 2, true, 2],
        ['work/meeting/2026', 3, true, 1],
      ]);
      expect(() =>
        t.preview(id, {
          source: 'work',
          action: 'rename',
          target: 'work/sub',
          scope: 'subtree',
        }),
      ).toThrow(/inside its own/);
      expect(() =>
        t.preview(id, {
          source: 'work',
          action: 'rename',
          target: 'home',
          scope: 'subtree',
        }),
      ).toThrow(/Merge/);
      const { preview } = execute(t, id, {
        source: 'work',
        action: 'rename',
        target: 'Job',
        scope: 'subtree',
      });
      expect(preview.mappings).toEqual([
        { from: 'work', to: 'Job', collision: false },
        { from: 'Work/Meeting', to: 'Job/Meeting', collision: false },
        { from: 'work/Meeting/2026', to: 'Job/Meeting/2026', collision: false },
      ]);
      expect(n.get(id, a).bodyMarkdown).toBe(
        'x #Job/Meeting and #Job `#work/meeting`',
      );
      expect(n.get(id, a).revision).toBe(2);
      expect(n.get(id, b).bodyMarkdown).toBe('#Job/Meeting/2026 #home');
      expect(t.list(id).map((r) => r.key)).toEqual([
        'home',
        'job',
        'job/meeting',
        'job/meeting/2026',
      ]);
      // Stale local tags under the old subtree map to the new prefix.
      expect(t.check(id, ['work/new', 'work'])).toEqual([
        {
          key: 'work/new',
          generation: 1,
          target: 'Job/new',
          targetPrefix: 'Job',
          suffixStart: 1,
        },
        {
          key: 'work',
          generation: 1,
          target: 'Job',
          targetPrefix: 'Job',
          suffixStart: 1,
        },
      ]);
      expect(() => create(n, id, '#work/new')).toThrow(/retired/);
      // Merge into an existing (implicit) node collapses collisions.
      create(n, id, '#home/meeting #proj/meeting');
      const merged = execute(t, id, {
        source: 'proj',
        action: 'merge',
        target: 'home',
        scope: 'subtree',
      });
      expect(merged.preview.mappings).toEqual([
        { from: 'proj/meeting', to: 'home/meeting', collision: true },
      ]);
      expect(
        flattenTagTree(publishedTags(p, id)).find((x) => x.key === 'home')
          ?.count,
      ).toBe(2);
      expect(t.list(id).some((r) => r.key.startsWith('proj'))).toBe(false);
    }));

  it('NT-MANAGE: remove scope exact keeps subtags, subtree removes all; implicit parents need subtree', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      const a = create(n, id, '#work #work/meeting #only/child keep');
      expect(() =>
        t.preview(id, {
          source: 'only',
          action: 'remove',
          target: null,
          scope: 'exact',
        }),
      ).toThrow(/subtags/);
      execute(t, id, {
        source: 'work',
        action: 'remove',
        target: null,
        scope: 'exact',
      });
      expect(n.get(id, a).bodyMarkdown).toBe(' #work/meeting #only/child keep');
      expect(t.check(id, ['work/meeting'])).toEqual([]);
      expect(t.check(id, ['work'])).toHaveLength(1);
      execute(t, id, {
        source: 'only',
        action: 'remove',
        target: null,
        scope: 'subtree',
      });
      expect(n.get(id, a).bodyMarkdown).toBe(' #work/meeting  keep');
      expect(t.check(id, ['only/child', 'only/other'])).toHaveLength(2);
      expect(n.get(id, a).tags).toEqual(['work/meeting']);
    }));

  it('NT-MANAGE: moving a subtree up and limit overflow are atomic', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      const a = create(n, id, '#a/b/x #a/b/b');
      execute(t, id, {
        source: 'a/b',
        action: 'rename',
        target: 'a',
        scope: 'subtree',
      });
      expect(n.get(id, a).bodyMarkdown).toBe('#a/x #a/b');
      expect(t.list(id).map((r) => r.key)).toEqual(['a', 'a/b', 'a/x']);
      const deep = create(n, id, '#d1/d2/d3/d4');
      const before = n.get(id, deep);
      expect(() =>
        t.preview(id, {
          source: 'd1',
          action: 'rename',
          target: 'e1/e2/e3',
          scope: 'subtree',
        }),
      ).toThrow(/tag limits/);
      expect(n.get(id, deep)).toEqual(before);
      expect(
        p.db.get<{ n: number }>(sql`select count(*) as n from tag_changes`)!.n,
      ).toBe(1);
    }));

  it('NT-PERF: 10k notes with ~400 nested tags record tree and subtree-filter timings', async () =>
    withPersistence(async (p) => {
      const id = owner(p),
        now = Date.now();
      const keys: string[] = [];
      for (let r = 0; r < 20; r++)
        for (let c = 0; c < 4; c++)
          for (let g = 0; g < 4; g++) keys.push(`root${r}/child${c}/leaf${g}`);
      for (let r = 0; r < 20; r++) keys.push(`root${r}`, `flat${r}`);
      p.write((tx) => {
        const tagIds = keys.map((key) => {
          const tagId = randomUUID();
          tx.insert(tags)
            .values({ id: tagId, normalizedKey: key, display: key })
            .run();
          return tagId;
        });
        for (let i = 0; i < 10_000; i++) {
          const noteId = randomUUID();
          tx.insert(notes)
            .values({
              id: noteId,
              bodyMarkdown: `Synthetic ${i} ` + 'memory '.repeat(250),
              status: 'published',
              timelineAt: now - i * 60_000,
              createdAt: now,
              updatedAt: now,
              revision: 1,
            })
            .run();
          for (const k of [
            i % keys.length,
            (i * 7 + 3) % keys.length,
            (i * 13 + 5) % keys.length,
          ])
            tx.insert(noteTags)
              .values({ noteId, tagId: tagIds[k] })
              .onConflictDoNothing()
              .run();
        }
      });
      const tree: number[] = [],
        filter: number[] = [];
      for (let i = 0; i < 10; i++) {
        let start = performance.now();
        publishedTags(p, id);
        tree.push(performance.now() - start);
        start = performance.now();
        await timelinePage(p, id, new URLSearchParams('tag=root3'));
        filter.push(performance.now() - start);
      }
      tree.sort((a, b) => a - b);
      filter.sort((a, b) => a - b);
      const roots = publishedTags(p, id);
      expect(roots).toHaveLength(40);
      for (let i = 1; i < roots.length; i++)
        expect(roots[i - 1].count).toBeGreaterThanOrEqual(roots[i].count);
      process.stdout.write(
        `NT-PERF 10k notes/${keys.length} tags: tree p50=${tree[5].toFixed(1)}ms p95=${tree[9].toFixed(1)}ms; subtree filter page p50=${filter[5].toFixed(1)}ms p95=${filter[9].toFixed(1)}ms
`,
      );
    }));
});
