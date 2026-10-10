// Runs with the minimized install in Alpine AND inside the final production image.
// All paths/data/passwords are synthetic; no secret/hash/content is printed.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import {
  hashPassword,
  verifyPassword,
} from '../../src/lib/server/auth/passwords.ts';
import { processImage } from '../../src/lib/server/attachments/images.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';

const defaultSettings = () => ({ ...DEFAULT_SETTINGS });
const dir = await mkdtemp(join(tmpdir(), 'pandanote-native-probe-'));
try {
  assert.equal(process.platform, 'linux');
  assert.equal(typeof process.execve, 'function');
  const db = new Database(join(dir, 'live.sqlite'));
  let sqlite: string;
  try {
    assert.equal(db.pragma('journal_mode=WAL', { simple: true }), 'wal');
    db.pragma('synchronous=FULL');
    db.pragma('foreign_keys=ON');
    db.pragma('wal_autocheckpoint=0');
    assert.equal(db.pragma('synchronous', { simple: true }), 2);
    db.exec(
      "CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER REFERENCES p(id)); CREATE VIRTUAL TABLE f USING fts5(s, tokenize='trigram');",
    );
    db.transaction(() => {
      db.prepare('INSERT INTO p VALUES (?)').run(1);
      db.prepare('INSERT INTO c VALUES (?)').run(1);
      db.prepare('INSERT INTO f VALUES (?)').run('香港 数据库 図書館 猫');
    })();
    assert.throws(() => db.prepare('INSERT INTO c VALUES (?)').run(2));
    assert.equal(
      (
        db
          .prepare('SELECT count(*) n FROM f WHERE f MATCH ?')
          .get('数据库') as { n: number }
      ).n,
      1,
    );
    assert.equal(
      (
        db
          .prepare('SELECT count(*) n FROM f WHERE instr(s,?)>0')
          .get('香港') as { n: number }
      ).n,
      1,
    );
    await db.backup(join(dir, 'copy.sqlite'));
    const copy = new Database(join(dir, 'copy.sqlite'), { readonly: true });
    try {
      assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(
        (copy.prepare('SELECT count(*) n FROM p').get() as { n: number }).n,
        1,
      );
    } finally {
      copy.close();
    }
    sqlite = (db.prepare('SELECT sqlite_version() v').get() as { v: string }).v;
  } finally {
    db.close();
  }
  const hash = await hashPassword('synthetic-only-password ✓');
  assert.equal(await verifyPassword(hash, 'synthetic-only-password ✓'), true);
  assert.equal(await verifyPassword(hash, 'wrong-synthetic-password'), false);
  for (const format of [
    'jpeg',
    'png',
    'webp',
    'gif',
    'tiff',
    'avif',
  ] as const) {
    const input = await sharp({
      create: { width: 80, height: 40, channels: 4, background: '#3f6b4d' },
    })
      .toFormat(format)
      .toBuffer();
    const source = join(dir, `input.${format}`);
    const display = join(dir, 'display.webp');
    const thumbnail = join(dir, 'thumbnail.webp');
    await writeFile(source, input);
    const result = await processImage(
      source,
      display,
      thumbnail,
      defaultSettings(),
    );
    assert.deepEqual([result.width, result.height], [80, 40]);
    for (const file of [display, thumbnail]) {
      const meta = await sharp(await readFile(file)).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.exif, undefined);
      assert.equal(meta.icc, undefined);
    }
  }
  const oriented = await sharp({
    create: { width: 80, height: 40, channels: 3, background: 'red' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const source = join(dir, 'oriented.jpg');
  await writeFile(source, oriented);
  assert.equal(
    (
      await processImage(
        source,
        join(dir, 'd.webp'),
        join(dir, 't.webp'),
        defaultSettings(),
      )
    ).width,
    40,
  );
  const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), {
    raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
  })
    .gif({ loop: 0, delay: [100, 100] })
    .toBuffer();
  await writeFile(source, animated);
  await assert.rejects(
    processImage(
      source,
      join(dir, 'd.webp'),
      join(dir, 't.webp'),
      defaultSettings(),
    ),
    /Animated/,
  );
  await writeFile(source, Buffer.from('invalid-synthetic-image'));
  await assert.rejects(
    processImage(
      source,
      join(dir, 'd.webp'),
      join(dir, 't.webp'),
      defaultSettings(),
    ),
    /corrupt/,
  );
  await writeFile(source, oriented);
  await assert.rejects(
    processImage(source, join(dir, 'd.webp'), join(dir, 't.webp'), {
      ...defaultSettings(),
      imageMaxPixels: 10,
    }),
    /pixel/,
  );
  const dst = (date: string) =>
    new Intl.DateTimeFormat('en', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      timeZoneName: 'short',
    }).format(new Date(date));
  assert.match(dst('2026-01-15T12:00:00Z'), /7.*EST/);
  assert.match(dst('2026-07-15T12:00:00Z'), /8.*EDT/);
  assert.ok(
    (await readFile('/etc/ssl/certs/ca-certificates.crt')).length > 1000,
  );
  const shared = process.report.getReport() as {
    sharedObjects: string[];
    header: { glibcVersionRuntime?: string };
  };
  const objects = shared.sharedObjects.filter((name) =>
    /\.node$|libvips/.test(name),
  );
  assert.ok(objects.some((name) => name.includes('better_sqlite3')));
  assert.ok(objects.some((name) => name.includes('argon2')));
  assert.ok(objects.some((name) => name.includes('sharp')));
  if (!shared.header.glibcVersionRuntime) {
    assert.ok(objects.some((name) => name.includes('linuxmusl')));
    assert.ok(
      objects.some((name) => name.includes('argon2') && name.includes('musl')),
    );
    for (const object of objects) {
      const result = execFileSync(
        'sh',
        ['-c', 'ldd "$1" 2>&1 || true', 'probe', object],
        { encoding: 'utf8' },
      );
      assert.doesNotMatch(
        result,
        /Error loading shared library .*No such file|=> not found/,
      );
    }
  }
  console.log(
    JSON.stringify({
      result:
        'PASS native SQLite/WAL/FK/trigram/backup, Argon2, static formats/orientation/animation/limits/subprocess, CA/DST/native TS/execve',
      node: process.versions.node,
      sqlite,
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
      libc: shared.header.glibcVersionRuntime ?? 'musl',
      objects,
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
