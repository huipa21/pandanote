import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { DomainError } from '../../shared/domain.ts';

// Operates ONLY on our own online snapshot, never an uploaded/untrusted database.
// Embedded fixed worker ships in the bundle; SQL cannot come from the caller.
// Vacuum purges freed credential/FTS pages without blocking the HTTP event loop.
const source = String.raw`
const fs = require('node:fs');
const Database = require(process.argv[1]);
process.umask(0o077);
const { path } = JSON.parse(fs.readFileSync(0, 'utf8'));
const db = new Database(path, { fileMustExist: true });
try {
  db.pragma('trusted_schema = OFF');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = DELETE');
  db.pragma('secure_delete = ON');
  db.pragma('cache_size = -8192');
  db.pragma('temp_store = FILE');
  const trigger = db.prepare("SELECT sql FROM sqlite_schema WHERE name='attachments_referenced_guard'").get().sql;
  db.transaction(() => {
    db.exec('DELETE FROM sessions; DELETE FROM auth_challenges; DELETE FROM auth_rate_limits; DELETE FROM backup_jobs; DELETE FROM file_cleanup_jobs;');
    db.exec('DELETE FROM attachments WHERE NOT EXISTS (SELECT 1 FROM note_attachments WHERE attachment_id=attachments.id)');
    db.exec('DROP TRIGGER attachments_referenced_guard; UPDATE attachments SET batch_id=NULL;');
    db.exec(trigger);
    db.exec('DELETE FROM upload_batches; DELETE FROM note_search_fts; DELETE FROM note_search;');
    db.exec("DELETE FROM mutation_receipts WHERE json_extract(result_json,'$.noteId') NOT IN (SELECT id FROM notes)");
  })();
  db.exec('VACUUM');
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || db.pragma('foreign_key_check').length) throw Error('integrity');
  process.stdout.write(JSON.stringify({
    notes: db.prepare('SELECT count(*) AS n FROM notes').get().n,
    attachments: db.prepare('SELECT count(*) AS n FROM attachments').get().n,
    peakRssKiB: process.resourceUsage().maxRSS,
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: ['SQLITE_FULL', 'ENOSPC'].includes(error.code) ? 'storage-full' : 'snapshot-failed' }));
  process.exitCode = 1;
} finally { db.close(); }
`;
export async function sanitizeSnapshot(
  path: string,
  signal: AbortSignal,
): Promise<{ notes: number; attachments: number; peakRssKiB: number }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--input-type=commonjs',
        '-e',
        source,
        createRequire(import.meta.url).resolve('better-sqlite3'),
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          SQLITE_TMPDIR: dirname(path),
          TMPDIR: dirname(path),
          TEMP: dirname(path),
          TMP: dirname(path),
        },
      },
    );
    let output = '';
    const abort = () => {
      child.kill('SIGKILL');
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (bytes: Buffer) => {
      output += bytes.toString();
      if (output.length > 4096) child.kill('SIGKILL');
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () =>
      reject(new DomainError('busy', 'err.snapshotProcessorCouldNotStart')),
    );
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (code !== 0 || signal.aborted) {
        let full = false;
        try {
          full = JSON.parse(output).error === 'storage-full';
        } catch {
          /* Discard native error text. */
        }
        reject(
          new DomainError(
            full ? 'storage-full' : 'busy',
            full
              ? 'err.notEnoughDiskSpaceFor2'
              : 'err.snapshotProcessingFailedOrTimed',
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error('Invalid snapshot processor result'));
      }
    });
    child.stdin.end(JSON.stringify({ path }));
  });
}
