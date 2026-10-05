import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { setImmediate as yieldToRequests } from 'node:timers/promises';
import { z } from 'zod';
import {
  applyMigrations,
  loadMigrations,
  SCHEMA_VERSION,
} from '../db/migrations.ts';
import { settingsSchema } from '../../shared/settings.ts';
import { uploadItemSchema } from '../../shared/attachments.ts';
import {
  idSchema,
  digestSchema,
  instantSchema,
  mutationResultSchema,
  noteMetadataSchema,
} from '../../shared/domain.ts';
import { keySchema } from '../storage/private-storage.ts';
import { decryptSecret } from '../auth/factors.ts';
import { inspectContent } from '../notes/content.ts';
import { refreshNoteSearch } from '../search/index.ts';
import type { BackupManifest } from '../../shared/backups.ts';
import type { RestoreSummary } from '../../shared/restores.ts';

// Uploaded SQL is never executed. Establish the exact migration-produced object
// inventory in a trusted in-memory DB, then compare BEFORE integrity/FK queries.
// Isolate native inspection from HTTP; a corrupt/hostile SQLite file cannot keep
// the server event loop inside integrity_check indefinitely.
const inspector = String.raw`
const fs = require('node:fs');
const Database = require(process.argv[1]);
const { path, schema, ledger, config, version, integrityOnly } = JSON.parse(fs.readFileSync(0, 'utf8'));
let db;
(async () => { try {
  db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('trusted_schema=OFF'); db.pragma('query_only=ON'); db.pragma('cache_size=-8192');
  const objects = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all();
  if (JSON.stringify(objects) !== JSON.stringify(schema)) throw Error('schema');
  if (db.pragma('user_version', {simple:true}) !== version || JSON.stringify(db.prepare('SELECT version,name,hash FROM __pandanote_migrations ORDER BY version').all()) !== JSON.stringify(ledger)) throw Error('ledger');
  // Bound every text/blob cell before transferring rows into the parent. Limits
  // are above valid domain values; note body has its separate exact byte bound.
  if(!integrityOnly) for (const object of objects.filter(x => x.type==='table' && !x.name.startsWith('sqlite_') && x.name!=='note_search_fts')) {
    if (db.prepare('SELECT count(*) n FROM "'+object.name+'"').get().n > 1000000) throw Error('count');
    const columns = db.prepare('PRAGMA table_info("'+object.name+'")').all();
    for (const col of columns) {
      const max = object.name==='notes' && col.name==='body_markdown' ? 1048576 : 16384;
      if (db.prepare('SELECT 1 FROM "'+object.name+'" WHERE length(CAST("'+col.name+'" AS BLOB)) > ? LIMIT 1').get(max)) throw Error('cell');
    }
  }
  if (db.prepare('SELECT count(*) n FROM notes').get().n > 100000 || db.prepare('SELECT coalesce(sum(length(CAST(body_markdown AS BLOB))),0) n FROM notes').get().n > 268435456) throw Error('notes');
  if (db.prepare('SELECT count(*) n FROM note_search_fts_config').get().n !== config.length || JSON.stringify(db.prepare('SELECT * FROM note_search_fts_config ORDER BY k').all()) !== JSON.stringify(config)) throw Error('fts config');
  if (db.pragma('integrity_check', { simple:true }) !== 'ok' || db.pragma('foreign_key_check').length) throw Error('integrity');
  const sharp = require(process.argv[2]);
  sharp.cache(false); sharp.concurrency(1);
  const nodePath = require('node:path');
  if(!integrityOnly) for (const row of db.prepare("SELECT * FROM attachments WHERE kind='image'").iterate()) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id)) throw Error('image id');
    for (const [variant,prefix] of [['display.webp',''],['thumbnail.webp','thumbnail_']]) {
      const imagePath=nodePath.join(nodePath.dirname(path),'..','files',row.id,variant);
      const options={limitInputPixels:50000000,failOn:'warning'};
      const meta = await sharp(imagePath, options).metadata();
      if(meta.format!=='webp' || (meta.pages||1)!==1 || meta.width!==row[prefix+'width'] || meta.height!==row[prefix+'height'] || meta.exif || meta.xmp || meta.icc) throw Error('image');
      // Metadata alone can accept a truncated bitstream with a valid header.
      // Decode sequentially in this hard-deadline, cache-free native worker.
      await sharp(imagePath, options).stats();
    }
  }
  process.stdout.write('ok');
} catch { process.exitCode=1; } finally { if(db) db.close(); } })();
`;
async function inspect(
  path: string,
  version: number,
  signal: AbortSignal,
  integrityOnly = false,
): Promise<void> {
  const migrations = loadMigrations().slice(0, version);
  const trusted = new Database(':memory:');
  let schema: unknown, ledger: unknown, config: unknown;
  try {
    applyMigrations(trusted, migrations);
    schema = trusted
      .prepare(
        'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name',
      )
      .all();
    config = trusted
      .prepare('SELECT * FROM note_search_fts_config ORDER BY k')
      .all();
    ledger = trusted
      .prepare(
        'SELECT version,name,hash FROM __pandanote_migrations ORDER BY version',
      )
      .all();
  } finally {
    trusted.close();
  }
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--input-type=commonjs',
        '-e',
        inspector,
        createRequire(import.meta.url).resolve('better-sqlite3'),
        createRequire(import.meta.url).resolve('sharp'),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '';
    const abort = () => {
      child.kill('SIGKILL');
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (b: Buffer) => {
      output += b.toString();
      if (output.length > 32) abort();
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (code === 0 && output === 'ok' && !signal.aborted) resolve();
      else reject(new Error('Untrusted SQLite snapshot'));
    });
    child.stdin.end(
      JSON.stringify({ path, schema, ledger, config, version, integrityOnly }),
    );
  });
}
const passwordHash =
  /^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;
async function* asRows(
  db: Database.Database,
  table: string,
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  let processed = 0;
  for (const row of db.prepare(`SELECT * FROM ${table}`).iterate() as Iterable<
    Record<string, unknown>
  >) {
    if (processed++ % 128 === 0) await yieldToRequests();
    signal.throwIfAborted();
    yield row;
  }
}
const number = (v: unknown) =>
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(v);
/** Read-only trust validation first. Only then run our migrations and rebuild
 * derived data on this disposable private staged DB, never on live storage. */
export async function trustSnapshot(
  root: string,
  manifest: BackupManifest,
  signal: AbortSignal,
): Promise<Omit<RestoreSummary, 'id' | 'bytes'>> {
  if (![4, SCHEMA_VERSION].includes(manifest.schemaVersion))
    throw new Error('Unsupported schema');
  const path = join(root, 'snapshot/pandanote.sqlite');
  await inspect(
    path,
    manifest.schemaVersion,
    AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
  );
  const keys = keySchema.parse(
    JSON.parse(readFileSync(join(root, 'snapshot/key-material.json'), 'utf8')),
  );
  const db = new Database(path, { readonly: true, fileMustExist: true });
  let summary: Omit<RestoreSummary, 'id' | 'bytes'>;
  try {
    db.pragma('trusted_schema=OFF');
    db.pragma('query_only=ON');
    for (const table of [
      'sessions',
      'auth_challenges',
      'auth_rate_limits',
      'setup_tokens',
      'upload_batches',
      'file_cleanup_jobs',
      'backup_jobs',
      'note_search',
      'note_search_fts',
    ])
      if (
        (db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n
      )
        throw new Error('Transient credentials/catalog');
    const owners = db.prepare('SELECT * FROM account').all() as Record<
      string,
      unknown
    >[];
    if (owners.length !== 1) throw new Error('Missing singleton account');
    const owner = owners[0];
    idSchema.parse(owner.id);
    instantSchema.parse(owner.created_at);
    number(owner.security_revision);
    if (!passwordHash.test(String(owner.password_hash)))
      throw new Error('Unsupported password hash');
    if (owner.totp_enabled === 1)
      z.string()
        .regex(/^[A-Z2-7]{16,128}$/)
        .parse(
          decryptSecret(
            keys,
            String(owner.totp_secret_encrypted),
            `account:${owner.id}`,
          ),
        );
    else if (
      owner.totp_secret_encrypted !== null ||
      owner.last_totp_step !== null
    )
      throw new Error('Unexpected MFA secret');
    if (owner.last_totp_step !== null) number(owner.last_totp_step);
    const settings = db.prepare('SELECT * FROM app_settings').all() as Record<
      string,
      unknown
    >[];
    if (settings.length !== 1) throw new Error('Missing singleton settings');
    settingsSchema.parse(JSON.parse(String(settings[0].value_json)));
    instantSchema.parse(settings[0].updated_at);
    let recoveries = 0;
    for await (const row of asRows(db, 'recovery_codes', signal)) {
      idSchema.parse(row.id);
      digestSchema.parse(row.code_hash);
      instantSchema.parse(row.created_at);
      if (row.consumed_at !== null) instantSchema.parse(row.consumed_at);
      recoveries++;
    }
    if (
      (owner.totp_enabled === 1 && recoveries !== 10) ||
      (owner.totp_enabled === 0 && recoveries)
    )
      throw new Error('Recovery-code state');
    const inventory = new Map(
      manifest.entries
        .filter((e) => e.path.startsWith('files/'))
        .map((e) => [e.path, e]),
    );
    let attachmentCount = 0;
    for await (const row of asRows(db, 'attachments', signal)) {
      signal.throwIfAborted();
      idSchema.parse(row.id);
      digestSchema.parse(row.incoming_digest);
      number(row.incoming_bytes);
      instantSchema.parse(row.created_at);
      if (
        row.readiness !== 'ready' ||
        row.batch_id !== null ||
        !db
          .prepare('SELECT 1 FROM note_attachments WHERE attachment_id=?')
          .get(row.id)
      )
        throw new Error('Unreferenced/unready attachment');
      uploadItemSchema.parse({
        id: row.id,
        filename: row.original_filename,
        incomingBytes: row.incoming_bytes,
        incomingDigest: row.incoming_digest,
      });
      z.string().min(1).max(255).parse(row.detected_mime);
      const variants =
        row.kind === 'file'
          ? [['attachment.bin', 'file']]
          : [
              ['display.webp', 'display'],
              ['thumbnail.webp', 'thumbnail'],
            ];
      for (const [variant, prefix] of variants) {
        const name = `files/${row.id}/${variant}`,
          entry = inventory.get(name);
        digestSchema.parse(row[`${prefix}_digest`]);
        number(row[`${prefix}_bytes`]);
        if (
          !entry ||
          entry.size !== row[`${prefix}_bytes`] ||
          entry.sha256 !== row[`${prefix}_digest`]
        )
          throw new Error('File metadata mismatch');
        inventory.delete(name);
      }
      if (
        row.kind === 'file' &&
        (row.file_digest !== row.incoming_digest ||
          row.file_bytes !== row.incoming_bytes)
      )
        throw new Error('Changed file');
      if (row.kind === 'image')
        for (const col of [
          'width',
          'height',
          'thumbnail_width',
          'thumbnail_height',
        ])
          z.number()
            .int()
            .positive()
            .max(col.startsWith('thumbnail_') ? 1024 : 4096)
            .parse(row[col]);
      attachmentCount++;
    }
    if (inventory.size || attachmentCount !== manifest.counts.attachments)
      throw new Error('File inventory mismatch');
    for await (const row of asRows(db, 'tags', signal)) {
      idSchema.parse(row.id);
      if (
        String(row.display).normalize('NFKC').toLowerCase() !==
        row.normalized_key
      )
        throw new Error('Tag identity');
    }
    let count = 0,
      published = 0,
      drafts = 0,
      trash = 0;
    for await (const row of asRows(db, 'notes', signal)) {
      if (count % 32 === 0) await yieldToRequests();
      signal.throwIfAborted();
      noteMetadataSchema.parse({
        id: row.id,
        status: row.status,
        priorStatus: row.prior_status,
        timelineAt: row.timeline_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        contentEditedAt: row.content_edited_at,
        revision: row.revision,
        location:
          row.latitude === null
            ? null
            : {
                latitude: row.latitude,
                longitude: row.longitude,
                accuracy: row.accuracy,
                label: row.location_label,
              },
      });
      const linked = db
        .prepare(
          'SELECT a.id,a.kind,na.ordinal FROM note_attachments na JOIN attachments a ON a.id=na.attachment_id WHERE na.note_id=? ORDER BY ordinal',
        )
        .all(row.id) as { id: string; kind: string; ordinal: number }[];
      if (linked.length > 100 || linked.some((r, i) => r.ordinal !== i))
        throw new Error('Attachment order');
      const body = String(row.body_markdown);
      const extracted = inspectContent(
        body,
        new Set(
          linked.filter((item) => item.kind === 'image').map((item) => item.id),
        ),
      )
        .map((t) => t.key)
        .sort();
      const stored = (
        db
          .prepare(
            'SELECT t.normalized_key FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=?',
          )
          .all(row.id) as { normalized_key: string }[]
      )
        .map((t) => t.normalized_key)
        .sort();
      if (JSON.stringify(extracted) !== JSON.stringify(stored))
        throw new Error('Tag references');
      count++;
      if (row.status === 'published') published++;
      else if (row.status === 'draft') drafts++;
      else trash++;
    }
    if (count !== manifest.counts.notes) throw new Error('Note counts');
    for (const table of [
      'mutation_receipts',
      ...(manifest.schemaVersion >= 5 ? ['tag_mutation_receipts'] : []),
    ])
      for await (const row of asRows(db, table, signal)) {
        idSchema.parse(row.mutation_id);
        digestSchema.parse(row.request_digest);
        instantSchema.parse(row.created_at);
        const result = JSON.parse(String(row.result_json));
        if (table === 'mutation_receipts') {
          mutationResultSchema.parse(result);
          if (!db.prepare('SELECT 1 FROM notes WHERE id=?').get(result.noteId))
            throw new Error('Receipt note');
        } else
          z.strictObject({
            generation: z.number().int().positive(),
            affected: z.number().int().nonnegative(),
          }).parse(result);
      }
    for await (const row of asRows(db, 'tag_changes', signal)) {
      number(row.generation);
      instantSchema.parse(row.created_at);
      z.string().min(1).max(256).parse(row.old_key);
      if (row.target_key !== null)
        z.string().min(1).max(256).parse(row.target_key);
    }
    summary = {
      createdAt: manifest.createdAt,
      schemaVersion: manifest.schemaVersion,
      notes: count,
      published,
      drafts,
      trash,
      attachments: attachmentCount,
      mfaEnabled: owner.totp_enabled === 1,
    };
  } finally {
    db.close();
  }
  signal.throwIfAborted();
  const staged = new Database(path, { fileMustExist: true });
  try {
    staged.pragma('trusted_schema=OFF');
    staged.pragma('foreign_keys=ON');
    staged.pragma('journal_mode=DELETE');
    staged.pragma('synchronous=FULL');
    // Search is excluded source data. Replace even its validated known shadow
    // tables/config with fresh trusted DDL before any derived-index mutation;
    // never carry uploaded internal FTS state into the live installation.
    staged.exec('DROP TABLE note_search_fts');
    for (const statement of loadMigrations().find(
      (m) => m.name === '0003_search_trigram',
    )!.statements)
      staged.exec(statement);
    applyMigrations(staged);
    // This connection belongs only to disposable staging. Explicit transaction
    // boundaries allow cooperative yielding without an async Drizzle callback
    // or holding the live application’s SQLite/write gate during reindexing.
    staged.exec('BEGIN IMMEDIATE');
    try {
      staged.exec(
        'DELETE FROM sessions; DELETE FROM auth_challenges; DELETE FROM auth_rate_limits; DELETE FROM setup_tokens; DELETE FROM backup_jobs; DELETE FROM note_search_fts; DELETE FROM note_search;',
      );
      const writer = drizzle(staged);
      let processed = 0;
      // better-sqlite3 forbids writes while an iterator statement is active.
      // Only bounded IDs (<=100k), never bodies, are materialized here.
      for (const row of staged
        .prepare('SELECT id FROM notes ORDER BY id')
        .all() as { id: string }[]) {
        if (processed++ % 32 === 0) await yieldToRequests();
        signal.throwIfAborted();
        refreshNoteSearch(writer, row.id);
      }
      writer.run(
        sql`insert into note_search_fts(note_search_fts) values ('optimize')`,
      );
      staged.exec('COMMIT');
    } catch (error) {
      staged.exec('ROLLBACK');
      throw error;
    }
  } finally {
    staged.close();
  }
  await inspect(
    path,
    SCHEMA_VERSION,
    AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    true,
  );
  return summary;
}
