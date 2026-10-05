import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { and, eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import {
  withPersistence,
  seedAccount,
  seedAttachment,
} from '../helpers/persistence.ts';
import {
  notes,
  sessions,
  noteAttachments,
} from '../../src/lib/server/db/schema.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { timelinePage } from '../../src/lib/server/notes/timeline.ts';
import { searchPredicates } from '../../src/lib/server/search/query.ts';
import {
  reindexSearch,
  refreshNoteSearch,
} from '../../src/lib/server/search/index.ts';
import {
  parseSearch,
  matchesSearch,
  normalizeSearch,
} from '../../src/lib/shared/search.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    sessionHash = 'c'.repeat(64),
    expiresAt = Date.now() + 3_600_000;
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
const params = (q: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ q, ...extra });
const command = (body: string) => ({
  action: 'create' as const,
  mutationId: randomUUID(),
  content: {
    bodyMarkdown: body,
    timelineAt: 100,
    location: null,
    attachmentIds: [] as string[],
  },
});

it('matches SEARCH-01/02 literals across separate fields, code and normalization; snippets are bounded even far into a note', async () => {
  await withPersistence(async (p) => {
    const identity = owner(p),
      service = new NoteService(p);
    const fixtures = [
      'Learning TypeScript today',
      '今日食咗點心，之後去香港。',
      '今天学习数据库，也喝了咖啡。',
      '今日は図書館に行った。日本語のメモ。猫が好き',
      'coffee at a new shop',
      'visited a coffee shop',
      'coffee',
      '```text\ncodeOnly % _ OR NEAR * \\path\n```',
      '<script>globalThis.attacked=1</script> ＣＡＦＥ́ 😊😊😊 #Width',
      'long '.repeat(5000) + '\0needle図書館 <img src=x onerror=alert(1)>',
    ];
    const created = fixtures.map((f) => service.mutate(identity, command(f)));
    const file = seedAttachment(p);
    mkdirSync(dirname(p.storage.attachmentPath(file, 'attachment.bin')), {
      recursive: true,
    });
    writeFileSync(p.storage.attachmentPath(file, 'attachment.bin'), 'test');
    p.write((tx) => {
      // Reference via source joins then the same transactional hook future tag /
      // filename management must use. The file metadata is immutable when linked.
      tx.run(
        sql`update attachments set original_filename='shop.pdf' where id=${file}`,
      );
      tx.insert(noteAttachments)
        .values({ noteId: created[6].noteId, attachmentId: file, ordinal: 0 })
        .run();
      refreshNoteSearch(tx, created[6].noteId);
    });
    const fields = fixtures.map((f, i) => [
      f,
      ...(i === 6 ? ['shop.pdf'] : []),
    ]);
    for (const q of [
      'typescript',
      'typescrpt',
      '點心',
      '香港',
      '猫',
      '数据库',
      '資料庫',
      '図書館',
      'としょかん',
      'coffee shop',
      '"coffee shop"',
      'codeonly',
      '%',
      '_',
      'OR',
      'NEAR',
      '*',
      '\\path',
      'café',
      '😊😊😊',
      '"<script>"',
      'needle図書館',
    ]) {
      const page = await timelinePage(p, identity, params(q, { limit: '100' }));
      const oracle = created
        .filter((_, i) => matchesSearch(fields[i], parseSearch(q)))
        .map((n) => n.noteId)
        .sort()
        .reverse();
      expect(
        page.items.map((n) => n.id),
        q,
      ).toEqual(oracle);
      expect(page.anchor).toBeNull();
    }
    const page = await timelinePage(p, identity, params('needle図書館'));
    expect(page.items[0].bodyMarkdown).not.toContain('needle');
    expect(
      page.items[0].snippets
        ?.flatMap((s) => s.segments)
        .filter((s) => s.highlighted)
        .map((s) => s.text),
    ).toContain('needle図書館');
    expect(JSON.stringify(page.items[0].snippets).length).toBeLessThan(2000);
  });
});
it('uses actual trigram candidates plus a separate-field literal oracle with deterministic randomized Unicode/punctuation fixtures', async () => {
  await withPersistence(async (p) => {
    owner(p);
    let state = 1234567;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const atoms = [
      'abc',
      '香港',
      '猫',
      '図書館',
      '数据库',
      'é',
      'e\u0301',
      '😊',
      '𠮷',
      '%',
      '_',
      'OR',
      'NEAR',
      '*',
      '"',
      '\\',
      '\0',
      'İ',
      'Σ',
      'ＡＢＣ',
      'ﬃ',
      ' ',
    ];
    const data: Array<{ id: string; fields: string[] }> = [];
    p.write((tx) => {
      for (let n = 0; n < 240; n++) {
        const body = Array.from(
          { length: 20 },
          () => atoms[next() % atoms.length],
        ).join('');
        const id = randomUUID();
        data.push({ id, fields: [body] });
        tx.insert(notes)
          .values({
            id,
            bodyMarkdown: body,
            status: n % 11 === 0 ? 'draft' : 'published',
            timelineAt: 100,
            createdAt: 100,
            updatedAt: 100,
            revision: 1,
          })
          .run();
        refreshNoteSearch(tx, id);
      }
    });
    const units = [
      ...atoms.map(normalizeSearch),
      '図書館abc',
      'abc abc',
      '香港猫',
      'ffi',
      'σσ',
      'i\u0307',
    ];
    for (let n = 0; n < 100; n++) {
      const field = normalizeSearch(data[next() % data.length].fields[0]);
      const points = [...field],
        start = next() % Math.max(1, points.length - 3);
      units.push(points.slice(start, start + 3 + (next() % 5)).join(''));
    }
    for (const unit of units) {
      if (!unit.length) continue;
      const oracle = data
        .filter((r, i) => i % 11 !== 0 && matchesSearch(r.fields, [unit]))
        .map((r) => r.id)
        .sort();
      for (const accelerate of [true, false]) {
        const actual = p.db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.status, 'published'),
              ...searchPredicates([unit], accelerate),
            ),
          )
          .all()
          .map((r) => r.id)
          .sort();
        expect(actual, JSON.stringify([unit, accelerate])).toEqual(oracle);
      }
    }
  });
});
it('combines search, all tags, UTC day and tied-date cursors; source changes/status/deletion/repair are immediate and atomic', async () => {
  await withPersistence(async (p) => {
    const identity = owner(p),
      service = new NoteService(p);
    const made = Array.from({ length: 45 }, (_, i) =>
      service.mutate(identity, command(`coffee ${i} #Work #香港`)),
    );
    const first = await timelinePage(
      p,
      identity,
      params('coffee', {
        tag: 'work',
        dayStart: '100',
        dayEnd: '101',
        limit: '20',
      }),
    );
    const second = await timelinePage(
      p,
      identity,
      params('ＣＯＦＦＥＥ', {
        tag: 'work',
        dayStart: '100',
        dayEnd: '101',
        cursor: first.nextCursor!,
        limit: '100',
      }),
    );
    expect([...first.items, ...second.items].map((n) => n.id)).toEqual(
      made
        .map((n) => n.noteId)
        .sort()
        .reverse(),
    );
    await expect(
      timelinePage(
        p,
        identity,
        params('shop', {
          tag: 'work',
          dayStart: '100',
          dayEnd: '101',
          cursor: first.nextCursor!,
        }),
      ),
    ).rejects.toThrow('different filters');
    expect(
      (
        await timelinePage(
          p,
          identity,
          params('coffee', { dayStart: '101', dayEnd: '200' }),
        )
      ).items,
    ).toEqual([]);
    const target = made[0];
    service.mutate(identity, {
      ...command('fresh図書館 #New'),
      action: 'update',
      noteId: target.noteId,
      expectedRevision: 1,
    });
    expect(
      (
        await timelinePage(p, identity, params('fresh図書館', { tag: 'new' }))
      ).items.map((n) => n.id),
    ).toEqual([target.noteId]);
    const action = (action: string, revision: number) =>
      service.mutate(identity, {
        action,
        noteId: target.noteId,
        expectedRevision: revision,
        mutationId: randomUUID(),
        ...(action === 'permanent-delete' ? { confirmed: true } : {}),
      });
    action('move-to-draft', 2);
    expect(
      (await timelinePage(p, identity, params('fresh図書館'))).items,
    ).toEqual([]);
    service.mutate(identity, {
      ...command('fresh図書館 #New'),
      action: 'publish',
      noteId: target.noteId,
      expectedRevision: 3,
    });
    action('trash', 4);
    action('restore', 5);
    expect(
      (await timelinePage(p, identity, params('fresh図書館'))).items,
    ).toHaveLength(1);
    const before = p.native
      .prepare('select * from note_search_fts order by note_id')
      .all();
    p.native.exec(
      "CREATE TRIGGER reject_receipt BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    expect(() =>
      service.mutate(identity, {
        ...command('rollbackXYZ'),
        action: 'update',
        noteId: target.noteId,
        expectedRevision: 6,
      }),
    ).toThrow();
    expect(
      p.native.prepare('select * from note_search_fts order by note_id').all(),
    ).toEqual(before);
    p.native.exec('DROP TRIGGER reject_receipt');
    p.write((tx) => tx.run(sql`delete from note_search_fts`));
    expect((await timelinePage(p, identity, params('coffee'))).items).toEqual(
      [],
    );
    expect(reindexSearch(p)).toBe(45);
    expect(
      (await timelinePage(p, identity, params('coffee', { limit: '100' })))
        .items,
    ).toHaveLength(44);
    const revisions = p.native
      .prepare('select id,revision,body_markdown from notes order by id')
      .all();
    execFileSync(process.execPath, ['scripts/reindex.ts'], {
      env: { ...process.env, DATA_DIR: p.storage.root },
      stdio: 'pipe',
    });
    expect(
      p.native
        .prepare('select id,revision,body_markdown from notes order by id')
        .all(),
    ).toEqual(revisions);
    action('trash', 6);
    action('permanent-delete', 7);
    expect(
      p.native
        .prepare('select note_id from note_search_fts where note_id=?')
        .get(target.noteId),
    ).toBeUndefined();
  });
});
