import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import { Persistence as Connection } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import {
  sessions,
  tagChanges,
  tagMutationReceipts,
} from '../../src/lib/server/db/schema.ts';
import {
  NoteService,
  NoteConflictError,
} from '../../src/lib/server/notes/service.ts';
import { TagService } from '../../src/lib/server/tags/service.ts';
import type { TagAction } from '../../src/lib/shared/tags.ts';
import { extractTags } from '../../src/lib/shared/markdown/tags.ts';
import { timelinePage } from '../../src/lib/server/notes/timeline.ts';
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
        expiresAt,
        createdAt: Date.now(),
        securityRevision: 1,
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    expiresAt,
    sessionHash,
    securityRevision: 1,
  };
}
function content(bodyMarkdown: string) {
  return { bodyMarkdown, timelineAt: 1000, location: null, attachmentIds: [] };
}
function create(
  n: NoteService,
  id: SessionIdentity,
  body = '#Work #work #香港',
) {
  return n.mutate(id, {
    action: 'create',
    mutationId: randomUUID(),
    content: content(body),
  });
}
function execute(t: TagService, id: SessionIdentity, operation: TagAction) {
  const preview = t.preview(id, operation);
  const command = {
    mutationId: randomUUID(),
    operation,
    previewToken: preview.previewToken,
    confirmed: true as const,
  };
  return { result: t.execute(id, command), command, preview };
}
describe('S14 real coordinated tag transactions', () => {
  it('rewrites all statuses, exact spans, revisions/search/joins/counts and no creation/date/status/location changes; case-only and collision semantics', async () =>
    withPersistence(async (p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      const body =
        'Prose #Work (#work) #香港\r\n\r\n`#Work` \\#Work https://x.invalid/#Work [#work](https://x.invalid/#work)\r\n\r\n```txt\r\n#work\r\n```\r\n\r\n<b>#work</b>';
      const a = create(n, id, body),
        b = create(n, id, body),
        c = create(n, id, body);
      n.mutate(id, {
        action: 'move-to-draft',
        noteId: b.noteId,
        expectedRevision: 1,
        mutationId: randomUUID(),
      });
      n.mutate(id, {
        action: 'trash',
        noteId: c.noteId,
        expectedRevision: 1,
        mutationId: randomUUID(),
      });
      expect(t.list(id).find((r) => r.key === 'work')).toMatchObject({
        published: 1,
        draft: 1,
        trash: 1,
      });
      const before = [a, b, c].map((r) => n.get(id, r.noteId));
      const operation: TagAction = {
        source: 'work',
        action: 'rename',
        target: '仕事',
      };
      const preview = t.preview(id, operation);
      expect(preview.counts).toEqual({ published: 1, draft: 1, trash: 1 });
      expect(preview.samples).toHaveLength(3);
      execute(t, id, operation);
      for (const old of before) {
        const current = n.get(id, old.id);
        expect(current).toMatchObject({
          createdAt: old.createdAt,
          timelineAt: old.timelineAt,
          status: old.status,
          priorStatus: old.priorStatus,
          revision: old.revision + 1,
          location: null,
          tags: ['仕事', '香港'],
        });
        expect(current.bodyMarkdown).toBe(
          body
            .replace('Prose #Work (#work)', 'Prose #仕事 (#仕事)')
            .replace('[#work]', '[#仕事]'),
        );
        expect(current.contentEditedAt).not.toBeNull();
        const derived = p.db.get<{ revision: number; tags: string }>(
          sql`select source_revision as revision,tag_fields_json as tags from note_search where note_id=${old.id}`,
        )!;
        expect(derived.revision).toBe(current.revision);
        expect(JSON.parse(derived.tags)).toEqual(current.tags);
      }
      expect(
        (await timelinePage(p, id, new URLSearchParams('tag=work'))).items,
      ).toHaveLength(0);
      expect(
        (await timelinePage(p, id, new URLSearchParams('tag=仕事'))).items.map(
          (r) => r.id,
        ),
      ).toEqual([a.noteId]);
      expect(() =>
        t.preview(id, { source: '仕事', action: 'rename', target: '香港' }),
      ).toThrow(/Merge/);
      execute(t, id, { source: '仕事', action: 'merge', target: '香港' });
      expect(n.get(id, a.noteId).tags).toEqual(['香港']);
      expect(extractTags(n.get(id, a.noteId).bodyMarkdown)).toEqual([
        { key: '香港', spelling: '香港' },
      ]);
      expect(t.list(id).some((r) => r.key === '仕事')).toBe(false);
      expect(() =>
        t.preview(id, { source: '香港', action: 'rename', target: '香港' }),
      ).toThrow(/different spelling/);
    }));
  it('case-only rename rewrites all token spelling without retiring the normalized key; remove leaves notes and adjacent whitespace', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p),
        a = create(n, id, '#Work #work  end');
      execute(t, id, { source: 'work', action: 'rename', target: 'WORK' });
      expect(n.get(id, a.noteId).bodyMarkdown).toBe('#WORK #WORK  end');
      expect(t.check(id, ['work'])).toEqual([]);
      create(n, id, '#work');
      execute(t, id, { source: 'work', action: 'remove', target: null });
      expect(n.get(id, a.noteId).bodyMarkdown).toBe('   end');
      expect(n.get(id, a.noteId).tags).toEqual([]);
      expect(t.list(id)).toEqual([]);
    }));
  it('preview is revision/body/history bound; concurrent editor conflicts, idempotent retries survive restart and later changes', async () =>
    withPersistence(async (p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p),
        a = create(n, id);
      const operation: TagAction = {
        source: 'work',
        action: 'rename',
        target: 'New',
      };
      const preview = t.preview(id, operation);
      n.mutate(id, {
        action: 'update',
        noteId: a.noteId,
        expectedRevision: 1,
        mutationId: randomUUID(),
        content: content('new #Work'),
      });
      expect(() =>
        t.execute(id, {
          operation,
          mutationId: randomUUID(),
          previewToken: preview.previewToken,
          confirmed: true,
        }),
      ).toThrow(/changed after preview/);
      const { command, result } = execute(t, id, operation);
      expect(() =>
        n.mutate(id, {
          action: 'update',
          noteId: a.noteId,
          expectedRevision: 2,
          mutationId: randomUUID(),
          content: content('losing #work'),
        }),
      ).toThrow(NoteConflictError);
      const second = new Connection(p.storage);
      try {
        const other = new TagService(second);
        expect(other.execute(id, command)).toEqual(result);
        execute(other, id, { source: 'new', action: 'remove', target: null });
        expect(other.execute(id, command)).toEqual(result);
        expect(() =>
          other.execute(id, {
            ...command,
            operation: { source: 'work', action: 'remove', target: null },
          }),
        ).toThrow(/differs/);
      } finally {
        await second.close();
      }
    }));
  it('history chains and removal/recreation require exact explicit acknowledgement, including a newer retirement; stale checks do not rewrite content', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      create(n, id);
      const first = execute(t, id, {
        source: 'work',
        action: 'rename',
        target: '仕事',
      }).result;
      execute(t, id, { source: '仕事', action: 'merge', target: '香港' });
      execute(t, id, { source: '香港', action: 'remove', target: null });
      expect(t.check(id, ['work', '仕事', '香港'])).toHaveLength(3);
      expect(t.check(id, ['work'])[0]).toEqual({
        key: 'work',
        generation: first.generation,
        target: null,
      });
      expect(() => create(n, id, 'retired #WORK')).toThrow(/retired tag/);
      const command = {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          ...content('retired #WORK'),
          tagAcknowledgements: [{ key: 'work', generation: first.generation }],
        },
      };
      const recreated = n.mutate(id, command);
      expect(n.get(id, recreated.noteId).bodyMarkdown).toBe('retired #WORK');
      expect(t.check(id, ['work'])).toHaveLength(1); // sticky even though registry exists again
      const next = execute(t, id, {
        source: 'work',
        action: 'remove',
        target: null,
      }).result;
      expect(() =>
        n.mutate(id, { ...command, mutationId: randomUUID() }),
      ).toThrow(/retired/);
      n.mutate(id, {
        ...command,
        mutationId: randomUUID(),
        content: {
          ...command.content,
          tagAcknowledgements: [{ key: 'work', generation: next.generation }],
        },
      });
      expect(n.mutate(id, command)).toEqual(recreated); // receipt-first even after retirement
    }));
  it('receipt fault rolls back body/registry/history/joins/FTS/revisions as one transaction; maintenance and revocation fail closed', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p),
        a = create(n, id);
      const before = n.get(id, a.noteId),
        operation: TagAction = {
          source: 'work',
          action: 'remove',
          target: null,
        };
      const preview = t.preview(id, operation),
        command = {
          operation,
          mutationId: randomUUID(),
          previewToken: preview.previewToken,
          confirmed: true,
        };
      p.native.exec(
        "CREATE TRIGGER fail_tag_receipt BEFORE INSERT ON tag_mutation_receipts BEGIN SELECT RAISE(ABORT,'injected'); END",
      );
      expect(() => t.execute(id, command)).toThrow(/injected/);
      expect(n.get(id, a.noteId)).toEqual(before);
      expect(p.db.select().from(tagChanges).all()).toHaveLength(0);
      expect(p.db.select().from(tagMutationReceipts).all()).toHaveLength(0);
      expect(p.native.pragma('foreign_key_check')).toEqual([]);
      p.native.exec('DROP TRIGGER fail_tag_receipt');
      t.execute(id, command);
      p.write((tx) =>
        tx.delete(sessions).where(eq(sessions.tokenHash, id.sessionHash)).run(),
      );
      expect(() => t.execute(id, command)).toThrow(/Sign in/);
    }));
  it('bounds searchable tag inventory and refuses configured rewritten size overflow atomically', async () =>
    withPersistence((p) => {
      const id = owner(p),
        n = new NoteService(p),
        t = new TagService(p);
      create(
        n,
        id,
        Array.from(
          { length: 100 },
          (_, i) => `#inventory${String(i).padStart(3, '0')}`,
        ).join(' '),
      );
      create(
        n,
        id,
        Array.from({ length: 10 }, (_, i) => `#inventory${i + 100}`).join(' '),
      );
      expect(t.list(id)).toHaveLength(100);
      expect(t.list(id, 'inventory109')).toMatchObject([
        { key: 'inventory109', published: 1, draft: 0, trash: 0 },
      ]);
      expect(() => t.list(id, 'x'.repeat(257))).toThrow(/too long/);
      const a = create(n, id, 'a'.repeat(1_048_568) + ' #x');
      const operation: TagAction = {
        source: 'x',
        action: 'rename',
        target: 'longreplacement',
      };
      const preview = t.preview(id, operation);
      expect(() =>
        t.execute(id, {
          operation,
          previewToken: preview.previewToken,
          mutationId: randomUUID(),
          confirmed: true,
        }),
      ).toThrow(/text limit/);
      expect(n.get(id, a.noteId).revision).toBe(1);
      expect(t.list(id, 'longreplacement')).toEqual([]);
      expect(p.native.pragma('integrity_check')).toEqual([
        { integrity_check: 'ok' },
      ]);
    }));
});
