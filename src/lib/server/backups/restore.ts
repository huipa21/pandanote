import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DomainError, idSchema } from '../../shared/domain.ts';
import { BACKUP_MAX_BYTES } from '../../shared/backups.ts';
import { SCHEMA_VERSION } from '../db/migrations.ts';
import {
  restoreConfirmSchema,
  type RestoreSummary,
} from '../../shared/restores.ts';
import type { Persistence } from '../db/connection.ts';
import { AuthService, type SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { DiskBudget } from '../attachments/resources.ts';
import { receive, syncFile } from '../attachments/files.ts';
import { syncDirectory } from '../storage/private-storage.ts';
import {
  JournalStore,
  type FilesystemJournal,
} from '../maintenance/journal.ts';
import { verifyArchive } from './archive.ts';
import { trustSnapshot } from './trust.ts';
import {
  createReplacementState,
  durableRename,
  recoverReplacement,
  stateParts,
  type SwapBoundary,
} from './replacement.ts';
import type { BackupService } from './service.ts';
interface Candidate {
  summary: RestoreSummary;
  release: () => void;
  owner: string;
}
interface Options {
  checkpoint?: (phase: SwapBoundary) => Promise<void>;
  deadlineMs?: number;
}
export class RestoreService {
  private readonly p: Persistence;
  private readonly auth: AuthService;
  private readonly disk: DiskBudget;
  private readonly backups: BackupService;
  private readonly options: Options;
  private candidate: Candidate | undefined;
  private running = false;
  constructor(
    p: Persistence,
    auth: AuthService,
    backups: BackupService,
    disk: DiskBudget,
    options: Options = {},
  ) {
    this.p = p;
    this.auth = auth;
    this.backups = backups;
    this.disk = disk;
    this.options = options;
  }
  summary(identity: SessionIdentity): RestoreSummary | null {
    this.p.db.transaction((tx) => assertSessionIdentity(tx, identity));
    return this.candidate?.owner === identity.account.id
      ? this.candidate.summary
      : null;
  }
  async discard(identity: SessionIdentity): Promise<void> {
    if (this.running)
      throw new DomainError(
        'busy',
        'Restore work is in progress. Wait before discarding.',
      );
    await this.p.coordinator.writeAsync(async (lease) => {
      this.p.write((tx) => assertSessionIdentity(tx, identity), lease);
      if (this.candidate?.owner === identity.account.id) await this.clear();
    });
  }
  private async clear(): Promise<void> {
    const old = this.candidate;
    if (!old) return;
    await rm(join(this.p.storage.root, 'staging/restores', old.summary.id), {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    this.candidate = undefined;
    old.release();
  }
  async upload(
    identity: SessionIdentity,
    request: Request,
  ): Promise<RestoreSummary> {
    if (this.running)
      throw new DomainError(
        'busy',
        'A restore upload or replacement is already running.',
      );
    const bytesText = request.headers.get('x-archive-bytes') ?? '';
    const bytes = Number(bytesText);
    if (
      !/^\d+$/.test(bytesText) ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > BACKUP_MAX_BYTES
    )
      throw new DomainError(
        'validation',
        'Invalid or oversized archive byte count.',
      );
    const id = randomUUID(),
      stage = this.p.storage.stagingDirectory('restores', id);
    this.running = true;
    const releases: (() => void)[] = [];
    try {
      return await this.p.coordinator.writeAsync(async (lease) => {
        this.p.write(
          (tx) =>
            this.auth.consumeFreshGrant(
              tx,
              identity,
              request.headers.get('x-restore-grant') ?? '',
              'restore',
            ),
          lease,
        );
        await this.clear();
        releases.push(this.disk.claim(bytes));
        const archive = join(stage, 'upload.pnb');
        await receive(
          request.body,
          archive,
          bytes,
          BACKUP_MAX_BYTES,
          BACKUP_MAX_BYTES,
          false,
          600_000,
        );
        const signal = AbortSignal.timeout(this.options.deadlineMs ?? 600_000);
        // Complete no-write verification before even creating extracted payloads.
        const manifest = await verifyArchive(
          archive,
          signal,
          undefined,
          undefined,
          (value) => {
            if (value.schemaVersion < 1 || value.schemaVersion > SCHEMA_VERSION)
              throw new Error('Unsupported schema');
            const databaseBytes = value.entries.find(
              (e) => e.path === 'snapshot/pandanote.sqlite',
            )!.size;
            if (
              value.entries.find(
                (e) => e.path === 'snapshot/key-material.json',
              )!.size > 4096
            )
              throw new Error('Oversized keys');
            // Claim expanded/migration/search headroom immediately after the bounded
            // manifest, BEFORE spending time inflating payloads that cannot fit.
            // Old data is retained by rename, not copied.
            releases.push(
              this.disk.claim(
                value.entries.reduce((sum, e) => sum + e.size, 0) +
                  databaseBytes * 6 +
                  32 * 1024 ** 2,
              ),
            );
          },
        );
        const extracted = join(stage, 'extracted');
        mkdirSync(extracted, { mode: 0o700 });
        await verifyArchive(archive, signal, manifest, extracted);
        const value = await trustSnapshot(extracted, manifest, signal);
        this.p.write((tx) => assertSessionIdentity(tx, identity), lease);
        signal.throwIfAborted();
        const state = createReplacementState(this.p.storage, id, extracted);
        await syncFile(join(state, 'db/pandanote.sqlite'));
        await syncFile(join(state, 'key-material.json'));
        // Extraction files are fsynced as well before a replacement can begin.
        for (const entry of manifest.entries.filter((e) =>
          e.path.startsWith('files/'),
        )) {
          await syncFile(join(state, ...entry.path.split('/')));
          syncDirectory(join(state, 'files', entry.path.split('/')[1]));
        }
        const summary = { ...value, id, bytes };
        this.candidate = {
          summary,
          owner: identity.account.id,
          release: () => releases.splice(0).forEach((release) => release()),
        };
        return summary;
      });
    } catch (error) {
      await rm(stage, { recursive: true, force: true, maxRetries: 3 });
      releases.splice(0).forEach((release) => release());
      if (error instanceof DomainError) throw error;
      if (
        ['ENOSPC', 'SQLITE_FULL'].includes(
          (error as NodeJS.ErrnoException)?.code ?? '',
        )
      )
        throw new DomainError(
          'storage-full',
          'Not enough disk space for restore staging. Free space and retry.',
        );
      throw new DomainError(
        'invalid-backup',
        'Archive is corrupt, incompatible, unsafe, or exceeds restore validation limits. Current data is unchanged.',
        { cause: error },
      );
    } finally {
      this.running = false;
    }
  }
  async confirm(identity: SessionIdentity, input: unknown): Promise<void> {
    const parsed = restoreConfirmSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        'validation',
        'Explicitly confirm full replacement.',
      );
    if (this.running || this.backups.isRunning)
      throw new DomainError(
        'busy',
        'Wait until backup or restore work finishes.',
      );
    if (new JournalStore(this.p.storage, this.p.coordinator).list().length)
      throw new DomainError(
        'busy',
        'Restore cleanup/recovery is pending. Restart the application before another restore.',
      );
    const candidate = this.candidate;
    if (
      !candidate ||
      candidate.owner !== identity.account.id ||
      candidate.summary.id !== parsed.data.id
    )
      throw new DomainError(
        'not-found',
        'Validated restore is unavailable. Upload again; restart discards unconfirmed uploads.',
      );
    this.running = true;
    try {
      await this.p.coordinator.exclusive(async (lease) => {
        this.p.write(
          (tx) =>
            this.auth.consumeFreshGrant(
              tx,
              identity,
              parsed.data.grant,
              'restore',
            ),
          lease,
        );
        const signal = AbortSignal.timeout(this.options.deadlineMs ?? 600_000);
        const state = join(
          this.p.storage.root,
          'staging/restores',
          candidate.summary.id,
          'state',
        );
        // Destination archives are outside the replacement set. Verify them before
        // rebuilding only the staged catalog; no source paths/catalog are adopted.
        const names = readdirSync(join(this.p.storage.root, 'backups'));
        if (names.length > 1000)
          throw new DomainError(
            'busy',
            'Backup inventory needs operator inspection.',
          );
        const catalog: { id: string; createdAt: number; bytes: number }[] = [];
        for (const name of names) {
          if (
            !name.endsWith('.pnb') ||
            !idSchema.safeParse(name.slice(0, -4)).success
          )
            continue;
          const id = name.slice(0, -4),
            path = this.p.storage.backupPath(id);
          try {
            const manifest = await verifyArchive(path, signal);
            catalog.push({
              id,
              createdAt: manifest.createdAt,
              bytes: statSync(path).size,
            });
          } catch {
            signal.throwIfAborted(); /* Preserve invalid archives on disk but never list as complete. */
          }
        }
        const staged = new Database(join(state, 'db/pandanote.sqlite'), {
          fileMustExist: true,
        });
        try {
          staged.pragma('trusted_schema=OFF');
          staged.pragma('synchronous=FULL');
          staged
            .transaction(() => {
              staged.exec('DELETE FROM backup_jobs');
              const insert = staged.prepare(
                "INSERT INTO backup_jobs(id,state,archive_id,bytes,progress,error_code,created_at,updated_at) VALUES (?,'complete',?,?,100,NULL,?,?)",
              );
              for (const row of catalog)
                insert.run(
                  row.id,
                  row.id,
                  row.bytes,
                  row.createdAt,
                  Date.now(),
                );
            })
            .immediate();
        } finally {
          staged.close();
        }
        await syncFile(join(state, 'db/pandanote.sqlite'));
        const rollbackId = randomUUID();
        this.p.storage.stagingDirectory('restores', rollbackId);
        const journal = new JournalStore(this.p.storage, this.p.coordinator);
        const record: FilesystemJournal = {
          version: 1,
          id: randomUUID(),
          kind: 'restore',
          phase: 'prepared',
          stagedStateId: candidate.summary.id,
          rollbackStateId: rollbackId,
          updatedAt: Date.now(),
        };
        let committed = false,
          closed = false,
          journaled = false;
        try {
          journal.put(record, lease);
          journaled = true;
          await this.options.checkpoint?.('prepared');
          this.p.closeForReplacement(lease);
          closed = true;
          for (const part of stateParts(this.p.storage, record)) {
            durableRename(part.live, part.old);
            await this.options.checkpoint?.(`old-${part.name}`);
            durableRename(part.staged, part.live);
            await this.options.checkpoint?.(`new-${part.name}`);
          }
          record.phase = 'new-state-installed';
          record.updatedAt = Date.now();
          journal.put(record, lease);
          this.p.reopenAfterReplacement(lease);
          await this.options.checkpoint?.('reopened');
          if (
            this.p.native.pragma('integrity_check', { simple: true }) !==
              'ok' ||
            (this.p.native.pragma('foreign_key_check') as unknown[]).length
          )
            throw new Error('Installed integrity');
          // Durable commit point. Startup keeps new state only after this record.
          record.phase = 'verified';
          record.updatedAt = Date.now();
          await this.options.checkpoint?.('committing');
          journal.put(record, lease);
          committed = true;
          await this.options.checkpoint?.('verified');
          recoverReplacement(this.p.storage, record, journal, lease);
          this.candidate = undefined;
          candidate.release();
        } catch (error) {
          if (!committed) {
            try {
              if (closed && this.p.native.open)
                this.p.closeForReplacement(lease);
              if (journaled) {
                // A failed commit-record fsync may have published 'verified'.
                // Durably select rollback BEFORE moving any old parts back.
                record.phase = 'rollback-required';
                record.updatedAt = Date.now();
                journal.put(record, lease);
                recoverReplacement(this.p.storage, record, journal, lease);
              }
              if (closed) this.p.reopenAfterReplacement(lease);
            } catch (recoveryError) {
              this.p.recoveryRequired = true;
              throw new DomainError(
                'busy',
                'Restore recovery requires application restart or operator inspection. Retained data and journal must not be deleted.',
                { cause: recoveryError },
              );
            }
            this.candidate = undefined;
            candidate.release();
            throw new DomainError(
              'busy',
              'Restore failed and the previous application was restored. Upload again to retry.',
              { cause: error },
            );
          }
          // A committed restore must never be reported as rolled back. Cleanup is
          // restart-recoverable and cannot erase unrelated completed archives.
          this.candidate = undefined;
          candidate.release();
        }
      }, 30_000);
    } finally {
      this.running = false;
    }
  }
}
