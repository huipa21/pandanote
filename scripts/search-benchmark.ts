import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { and, desc, eq } from 'drizzle-orm';
import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import {
  connectDatabase,
  Persistence,
} from '../src/lib/server/db/connection.ts';
import { applyMigrations } from '../src/lib/server/db/migrations.ts';
import { initializeSettings } from '../src/lib/server/settings/repository.ts';
import {
  notes,
  account,
  sessions,
  tags,
  noteTags,
} from '../src/lib/server/db/schema.ts';
import { reindexSearch } from '../src/lib/server/search/index.ts';
import { searchPredicates } from '../src/lib/server/search/query.ts';
import { parseSearch, matchesSearch } from '../src/lib/shared/search.ts';
import { timelinePage } from '../src/lib/server/notes/timeline.ts';

// Synthetic temporary 10k-note benchmark. Never reads the deployment DATA_DIR.
const root = mkdtempSync(join(tmpdir(), 'pandanote-search-measure-'));
let p: Persistence | undefined;
try {
  const storage = new PrivateStorage({ dataDir: root });
  storage.initializeKeys();
  const db = connectDatabase(storage.databasePath);
  try {
    applyMigrations(db);
  } finally {
    db.close();
  }
  p = new Persistence(storage);
  initializeSettings(p);
  const id = randomUUID(),
    now = Date.now(),
    expiresAt = now + 3_600_000,
    sessionHash = 'd'.repeat(64);
  const identity = {
    account: { id, mfaEnabled: false },
    sessionHash,
    expiresAt,
    securityRevision: 1,
  };
  const languages = [
    'Learning TypeScript in a coffee shop. ',
    '今日食咗點心，之後去香港。',
    '今天学习数据库，也喝了咖啡。',
    '今日は図書館に行った。猫が好き。',
    'Mixed ＣＡＦＥ́ emoji 😊 literal % _ OR NEAR. ',
  ];
  const data: { id: string; body: string }[] = [];
  let sourceBytes = 0;
  p.write((tx) => {
    tx.insert(account)
      .values({
        id,
        passwordHash: 'synthetic-not-a-credential',
        createdAt: now,
      })
      .run();
    tx.insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        expiresAt,
        createdAt: now,
      })
      .run();
    const tagIds = Array.from({ length: 300 }, (_, n) => {
      const tagId = randomUUID();
      tx.insert(tags)
        .values({ id: tagId, normalizedKey: `tag${n}`, display: `tag${n}` })
        .run();
      return tagId;
    });
    for (let n = 0; n < 10_000; n++) {
      const body =
        `Synthetic ${n} #tag${n % 300}\n\n` +
        languages[n % 5].repeat(
          Math.ceil(2000 / Buffer.byteLength(languages[n % 5])),
        ) +
        (n === 9900 ? ' rareNeedle図書館' : '');
      const noteId = randomUUID();
      sourceBytes += Buffer.byteLength(body);
      data.push({ id: noteId, body });
      tx.insert(notes)
        .values({
          id: noteId,
          bodyMarkdown: body,
          status: 'published',
          timelineAt: now - n * 86_400_000,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        })
        .run();
      tx.insert(noteTags)
        .values({ noteId, tagId: tagIds[n % 300] })
        .run();
    }
  });
  const started = performance.now();
  reindexSearch(p);
  const reindexMs = performance.now() - started;
  const results = [];
  for (const query of [
    'typescript',
    '数据库',
    '図書館',
    'rareNeedle図書館',
    'absentXYZ',
    '香港',
    '猫',
    '龘',
    '咗心',
    '%',
    'coffee shop',
    '"coffee shop"',
  ]) {
    const units = parseSearch(query);
    const run = (accelerate: boolean) =>
      p!.db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.status, 'published'),
            ...searchPredicates(units, accelerate),
          ),
        )
        .orderBy(desc(notes.timelineAt), desc(notes.id))
        .limit(31)
        .all()
        .map((r) => r.id);
    const oracle = data
      .filter((r) => matchesSearch([r.body], units))
      .slice(0, 31)
      .map((r) => r.id);
    for (const accelerate of [true, false]) {
      const cold = performance.now();
      const actual = run(accelerate);
      const firstMs = performance.now() - cold;
      if (JSON.stringify(actual) !== JSON.stringify(oracle))
        throw new Error('Search oracle mismatch');
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        run(accelerate);
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      results.push({
        query,
        accelerate,
        firstMs: +firstMs.toFixed(2),
        p50Ms: +samples[15].toFixed(2),
        p95Ms: +samples[28].toFixed(2),
      });
    }
  }
  const renderSamples = [];
  const page = await timelinePage(
    p,
    identity,
    new URLSearchParams({ q: '図書館' }),
  );
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await timelinePage(p, identity, new URLSearchParams({ q: '図書館' }));
    renderSamples.push(performance.now() - start);
  }
  renderSamples.sort((a, b) => a - b);
  p.native.pragma('wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        sqlite: p.native.prepare('select sqlite_version() as version').get(),
        notes: data.length,
        averageSourceBytes: sourceBytes / data.length,
        reindexMs: +reindexMs.toFixed(1),
        databaseBytes: statSync(storage.databasePath).size,
        peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
        pageBytes: Buffer.byteLength(JSON.stringify(page)),
        queryAndRender: {
          p50Ms: +renderSamples[5].toFixed(1),
          p95Ms: +renderSamples[9].toFixed(1),
        },
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await p?.close();
  rmSync(root, { recursive: true, force: true });
}
