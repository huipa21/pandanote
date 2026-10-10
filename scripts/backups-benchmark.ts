import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import {
  Persistence,
  connectDatabase,
} from '../src/lib/server/db/connection.ts';
import { applyMigrations } from '../src/lib/server/db/migrations.ts';
import { initializeSettings } from '../src/lib/server/settings/repository.ts';
import { AuthService } from '../src/lib/server/auth/service.ts';
import { BackupService } from '../src/lib/server/backups/service.ts';
import { DiskBudget } from '../src/lib/server/attachments/resources.ts';
import {
  notes,
  attachments,
  noteAttachments,
  appSettings,
} from '../src/lib/server/db/schema.ts';
// Isolated synthetic fixture, never deployment DATA_DIR or private user data.
const root = mkdtempSync(join(tmpdir(), 'pandanote-backup-measure-'));
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
  const password = 'synthetic-benchmark-password 密碼';
  const auth = new AuthService(p);
  const initial = await auth.createAccount(
    {
      username: 'benchmark',
      email: 'benchmark@example.invalid',
      password,
      passwordConfirm: password,
    },
    '192.0.2.71',
  );
  auth.finishSetup(auth.authenticate(initial.token)!, {
    siteTitle: 'PandaNote',
    language: 'en',
    timezone: 'UTC',
  });
  const identity = auth.authenticate(initial.token)!;
  const fileId = randomUUID(),
    noteId = randomUUID(),
    now = Date.now();
  const bytes = randomBytes(32 * 1024 ** 2),
    digest = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(join(root, 'files', fileId));
  writeFileSync(storage.attachmentPath(fileId, 'attachment.bin'), bytes, {
    mode: 0o600,
  });
  p.write((tx) => {
    tx.insert(attachments)
      .values({
        id: fileId,
        kind: 'file',
        readiness: 'ready',
        originalFilename: 'synthetic-random.bin',
        detectedMime: 'application/octet-stream',
        incomingDigest: digest,
        incomingBytes: bytes.length,
        fileBytes: bytes.length,
        fileDigest: digest,
        createdAt: now,
      })
      .run();
    for (let n = 0; n < 10_000; n++) {
      tx.insert(notes)
        .values({
          id: n === 0 ? noteId : randomUUID(),
          bodyMarkdown:
            `Synthetic ${n} ` +
            '今日食咗點心 香港 数据库 図書館 TypeScript coffee shop. '.repeat(
              25,
            ),
          status: n % 10 === 1 ? 'trash' : 'published',
          priorStatus: n % 10 === 1 ? 'published' : null,
          timelineAt: now - n * 3600_000,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        })
        .run();
    }
    tx.insert(noteAttachments)
      .values({ noteId, attachmentId: fileId, ordinal: 0 })
      .run();
  });
  function treeBytes(): { logical: number; unique: number } {
    const seen = new Set<string>();
    let logical = 0,
      unique = 0;
    const visit = (path: string) => {
      for (const name of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, name.name);
        if (name.isDirectory()) visit(file);
        else if (name.isFile()) {
          try {
            const stat = statSync(file);
            logical += stat.size;
            const key = `${stat.dev}:${stat.ino}`;
            if (!seen.has(key)) {
              unique += stat.size;
              seen.add(key);
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      }
    };
    visit(root);
    return { logical, unique };
  }
  const results = [];
  for (const forceCopy of [false, true]) {
    const s = new BackupService(p, auth, new DiskBudget(root, 0), {
      forceCopy,
    });
    const grant = (
      await auth.freshAuth(
        identity,
        'backup-create',
        password,
        undefined,
        '192.0.2.71',
      )
    ).token;
    const baseline = treeBytes();
    let peakLogical = baseline.logical,
      peakUnique = baseline.unique,
      peakRss = process.memoryUsage().rss;
    let reads = 0,
      writes = 0,
      busyWrites = 0,
      readMaxMs = 0,
      tickMaxMs = 0,
      previous = performance.now();
    const sample = () => {
      const current = performance.now();
      tickMaxMs = Math.max(tickMaxMs, current - previous);
      previous = current;
      const disk = treeBytes();
      peakLogical = Math.max(peakLogical, disk.logical);
      peakUnique = Math.max(peakUnique, disk.unique);
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      const start = performance.now();
      p!.native
        .prepare(
          "SELECT id FROM notes WHERE status='published' ORDER BY timeline_at DESC, id DESC LIMIT 30",
        )
        .all();
      readMaxMs = Math.max(readMaxMs, performance.now() - start);
      reads++;
      try {
        p!.write((tx) =>
          tx.update(appSettings).set({ updatedAt: Date.now() }).run(),
        );
        writes++;
      } catch {
        busyWrites++;
      }
    };
    const timer = setInterval(sample, 25);
    const job = s.create(identity, { id: randomUUID(), grant });
    try {
      await s.wait();
      sample();
    } finally {
      clearInterval(timer);
    }
    const state = s.list(identity).find((item) => item.id === job.id)!;
    if (state.state !== 'complete')
      throw new Error(`Synthetic backup failed: ${state.errorCode}`);
    results.push({
      mode: forceCopy ? 'copy' : 'hardlink',
      ...s.metrics.get(job.id),
      archiveBytes: state.bytes,
      sampledPeakLogicalBytes: peakLogical,
      sampledPeakUniqueBytes: peakUnique,
      baselineDiskBytes: baseline.unique,
      sampledParentPeakRssBytes: peakRss,
      reads,
      successfulWrites: writes,
      busyWrites,
      readMaxMs: +readMaxMs.toFixed(2),
      samplerIntervalMaxMs: +tickMaxMs.toFixed(2),
    });
  }
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        noteCount: 10_000,
        fileBytes: bytes.length,
        samplingMs: 25,
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
