import {
  existsSync,
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { link, open, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, eq, inArray } from 'drizzle-orm';
import {
  backupCreateSchema,
  backupDeleteSchema,
  backupDownloadSchema,
  backupManifestSchema,
  BACKUP_FORMAT,
  BACKUP_MAX_ENTRIES,
  BACKUP_MAX_BYTES,
  type BackupJob,
  type BackupEntry,
} from '../../shared/backups.ts';
import { DomainError, idSchema } from '../../shared/domain.ts';
import type { Persistence } from '../db/connection.ts';
import { SCHEMA_VERSION } from '../db/migrations.ts';
import { attachments, backupJobs, noteAttachments } from '../db/schema.ts';
import { AuthService, type SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { DiskBudget } from '../attachments/resources.ts';
import {
  checksum,
  syncFile,
  downloadDisposition,
} from '../attachments/files.ts';
import {
  syncDirectory,
  writePrivateJson,
  type AttachmentVariant,
} from '../storage/private-storage.ts';
import { sanitizeSnapshot } from './snapshot.ts';
import { verifyArchive, writeArchive } from './archive.ts';

export interface BackupMetrics {
  captureMs: number;
  elapsedMs: number;
  estimatedPeakBytes: number;
  workerPeakRssKiB: number;
}
interface Options {
  forceCopy?: boolean;
  captureMs?: number;
  jobMs?: number;
  checkpoint?: (phase: 'capturing' | 'captured' | 'verified') => Promise<void>;
}
function dto(row: typeof backupJobs.$inferSelect): BackupJob {
  const { id, state, bytes, progress, errorCode, createdAt, updatedAt } = row;
  return { id, state, bytes, progress, errorCode, createdAt, updatedAt };
}
export class BackupService {
  private readonly p: Persistence;
  private readonly auth: AuthService;
  private readonly disk: DiskBudget;
  private readonly options: Options;
  private running: Promise<void> | undefined;
  readonly metrics = new Map<string, BackupMetrics>();
  constructor(
    p: Persistence,
    auth: AuthService,
    disk = new DiskBudget(p.storage.root),
    options: Options = {},
  ) {
    this.p = p;
    this.auth = auth;
    this.disk = disk;
    this.options = options;
    this.recover();
  }
  private recover(): void {
    // No resumption or automatic creation. Interrupted jobs fail closed. A crash
    // between rename and SQL completion never publishes an unverified archive.
    const rows = this.p.db.select().from(backupJobs).all();
    for (const row of rows) {
      if (!['complete', 'failed'].includes(row.state)) {
        rmSync(this.p.storage.backupPath(row.id), { force: true });
        this.p.write((tx) =>
          tx
            .update(backupJobs)
            .set({
              state: 'failed',
              errorCode: 'interrupted',
              progress: 0,
              updatedAt: Date.now(),
            })
            .where(eq(backupJobs.id, row.id))
            .run(),
        );
      } else if (
        row.state === 'complete' &&
        !existsSync(this.p.storage.backupPath(row.id))
      ) {
        this.p.write((tx) =>
          tx
            .update(backupJobs)
            .set({
              state: 'failed',
              errorCode: 'archive-missing',
              progress: 0,
              updatedAt: Date.now(),
            })
            .where(eq(backupJobs.id, row.id))
            .run(),
        );
      }
    }
    const root = join(this.p.storage.root, 'staging/backups');
    const names = readdirSync(root);
    if (names.length > 1000)
      throw new Error('Backup staging requires operator inspection');
    for (const name of names) {
      if (!idSchema.safeParse(name).success) continue;
      const path = join(root, name);
      if (lstatSync(path).isSymbolicLink())
        throw new Error('Unsafe backup staging');
      rmSync(path, { recursive: true, force: true });
    }
  }
  list(identity: SessionIdentity): BackupJob[] {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      return tx
        .select()
        .from(backupJobs)
        .all()
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, 100)
        .map(dto);
    });
  }
  create(identity: SessionIdentity, input: unknown): BackupJob {
    const parsed = backupCreateSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidBackupRequest');
    const { id } = parsed.data;
    const job = this.p.write((tx) => {
      // Creation needs only a valid session (same-origin/CSRF checked at HTTP layer).
      assertSessionIdentity(tx, identity);
      const old = tx
        .select()
        .from(backupJobs)
        .where(eq(backupJobs.id, id))
        .get();
      if (old) return dto(old);
      if (existsSync(this.p.storage.backupPath(id)))
        throw new DomainError('validation', 'err.thisBackupIdentityAlreadyHas');
      if (
        this.running ||
        tx
          .select()
          .from(backupJobs)
          .where(
            inArray(backupJobs.state, ['pending', 'capturing', 'archiving']),
          )
          .get()
      )
        throw new DomainError('busy', 'err.aBackupIsAlreadyRunning');
      if (tx.select().from(backupJobs).all().length >= 1000)
        throw new DomainError('busy', 'err.backupHistoryIsFullDelete');
      const now = Date.now();
      tx.insert(backupJobs)
        .values({ id, state: 'pending', createdAt: now, updatedAt: now })
        .run();
      return dto(
        tx.select().from(backupJobs).where(eq(backupJobs.id, id)).get()!,
      );
    });
    if (job.state === 'pending' && !this.running) {
      const task = Promise.resolve().then(() => this.run(identity, job.id));
      this.running = task;
      void task
        .finally(() => {
          if (this.running === task) this.running = undefined;
        })
        .catch(() => {});
    }
    return job;
  }
  get isRunning(): boolean {
    return this.running !== undefined;
  }
  async wait(): Promise<void> {
    await this.running;
  }
  private async update(
    id: string,
    state: BackupJob['state'],
    progress: number,
    errorCode: string | null = null,
  ): Promise<void> {
    // Other exclusive cleanup may briefly own the gate. Do not lose terminal
    // status merely because a correctly coordinated unrelated mutation overlaps.
    const until = performance.now() + 35_000;
    while (true) {
      try {
        this.p.write((tx) =>
          tx
            .update(backupJobs)
            .set({ state, progress, errorCode, updatedAt: Date.now() })
            .where(eq(backupJobs.id, id))
            .run(),
        );
        return;
      } catch (error) {
        if (
          !(error instanceof DomainError) ||
          error.code !== 'busy' ||
          performance.now() >= until
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
  private async run(identity: SessionIdentity, id: string): Promise<void> {
    const started = performance.now();
    const signal = AbortSignal.timeout(this.options.jobMs ?? 600_000);
    let stage: string | undefined;
    let release: (() => void) | undefined;
    let complete = false;
    try {
      stage = this.p.storage.stagingDirectory('backups', id);
      const source = (name: string) => join(stage!, ...name.split('/'));
      let entries: BackupEntry[] = [];
      let capturedAt = 0;
      let estimate = 0;
      await this.update(id, 'capturing', 5);
      const captureStart = performance.now();
      const captureSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(this.options.captureMs ?? 120_000),
      ]);
      await this.p.coordinator.exclusive(async (lease) => {
        this.p.write((tx) => assertSessionIdentity(tx, identity), lease);
        await this.options.checkpoint?.('capturing');
        captureSignal.throwIfAborted();
        const rows = this.p.db
          .selectDistinct({ row: attachments })
          .from(attachments)
          .innerJoin(
            noteAttachments,
            eq(noteAttachments.attachmentId, attachments.id),
          )
          .all()
          .map((item) => item.row);
        if (rows.some((row) => row.readiness !== 'ready'))
          throw new Error('Unready referenced file');
        const variants: Array<{
          id: string;
          variant: AttachmentVariant;
          size: number;
          digest: string;
        }> = [];
        for (const row of rows) {
          if (row.kind === 'file')
            variants.push({
              id: row.id,
              variant: 'attachment.bin',
              size: row.fileBytes!,
              digest: row.fileDigest!,
            });
          else {
            variants.push(
              {
                id: row.id,
                variant: 'display.webp',
                size: row.displayBytes!,
                digest: row.displayDigest!,
              },
              {
                id: row.id,
                variant: 'thumbnail.webp',
                size: row.thumbnailBytes!,
                digest: row.thumbnailDigest!,
              },
            );
          }
        }
        if (variants.length + 3 > BACKUP_MAX_ENTRIES)
          throw new DomainError('validation', 'err.tooManyFilesForThis');
        const dbBytes =
          (this.p.native.pragma('page_count', { simple: true }) as number) *
          (this.p.native.pragma('page_size', { simple: true }) as number);
        const fileBytes = variants.reduce((sum, item) => sum + item.size, 0);
        if (dbBytes >= 8 * 1024 ** 3 || dbBytes + fileBytes > BACKUP_MAX_BYTES)
          throw new DomainError(
            'validation',
            'err.notebookExceedsThisBackupFormat',
          );
        // Worst case: copied files + uncompressed/incompressible gzip, snapshot
        // + VACUUM scratch + archive DB. Hardlinks reduce actual peak, not estimate.
        estimate =
          dbBytes * 3 +
          fileBytes * 2 +
          32 * 1024 ** 2 +
          variants.length * 1024 +
          Math.ceil((dbBytes + fileBytes) / 1000);
        release = this.disk.claim(estimate);
        mkdirSync(dirname(source('snapshot/pandanote.sqlite')), {
          recursive: true,
          mode: 0o700,
        });
        capturedAt = Date.now();
        await this.p.native.backup(source('snapshot/pandanote.sqlite'), {
          progress: () => {
            captureSignal.throwIfAborted();
            return 256;
          },
        });
        if (process.platform !== 'win32')
          chmodSync(source('snapshot/pandanote.sqlite'), 0o600);
        await syncFile(source('snapshot/pandanote.sqlite'));
        writePrivateJson(
          source('snapshot/key-material.json'),
          this.p.storage.readKeys(),
          true,
        );
        for (const item of variants) {
          captureSignal.throwIfAborted();
          const input = this.p.storage.attachmentPath(item.id, item.variant);
          if (statSync(input).size !== item.size)
            throw new Error('Missing or changed attachment');
          const name = `files/${item.id}/${item.variant}`;
          mkdirSync(dirname(source(name)), { recursive: true, mode: 0o700 });
          try {
            if (this.options.forceCopy)
              throw Object.assign(new Error('copy'), { code: 'ENOTSUP' });
            await link(input, source(name));
          } catch (error) {
            if (
              !['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(
                (error as NodeJS.ErrnoException).code ?? '',
              )
            )
              throw error;
            await pipeline(
              createReadStream(input),
              createWriteStream(source(name), { flags: 'wx', mode: 0o600 }),
              { signal: captureSignal },
            );
            await syncFile(source(name));
          }
          entries.push({ path: name, size: item.size, sha256: item.digest });
        }
      }, 30_000);
      const captureMs = Math.round(performance.now() - captureStart);
      await this.update(id, 'archiving', 25);
      await this.options.checkpoint?.('captured');
      const counts = await sanitizeSnapshot(
        source('snapshot/pandanote.sqlite'),
        signal,
      );
      for (const path of [
        'snapshot/pandanote.sqlite',
        'snapshot/key-material.json',
      ]) {
        const value = await checksum(source(path), signal);
        entries.push({ path, size: value.bytes, sha256: value.digest });
      }
      entries = entries.sort((a, b) => a.path.localeCompare(b.path));
      // Hash captured immutable files outside the gate. Detect corruption before
      // publication; we also verify the actual compressed archive independently.
      for (const entry of entries) {
        signal.throwIfAborted();
        const value = await checksum(source(entry.path), signal);
        if (entry.size !== value.bytes || entry.sha256 !== value.digest)
          throw new Error('Captured file checksum mismatch');
      }
      const manifest = backupManifestSchema.parse({
        format: 'PandaNote',
        formatVersion: BACKUP_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        appVersion: '0.0.0',
        createdAt: capturedAt,
        counts: { notes: counts.notes, attachments: counts.attachments },
        included:
          'notes,trash,tags,receipts,files,settings,account,mfa,recovery-codes,portable-keys',
        excluded:
          'unsaved-editors,sessions,challenges,rate-limits,pending-uploads,cleanup-jobs,search,backup-catalog,archives,staging,pre-upgrade,deployment',
        entries,
      });
      await this.update(id, 'archiving', 50);
      const archive = join(stage, 'archive.tmp');
      await writeArchive(archive, manifest, source, signal);
      await syncFile(archive);
      await this.update(id, 'archiving', 80);
      await verifyArchive(archive, signal, manifest);
      await this.options.checkpoint?.('verified');
      signal.throwIfAborted();
      // Rename and catalog publication share a lease with no new exclusive work.
      await this.p.coordinator.writeAsync(async (lease) => {
        const bytes = statSync(archive).size;
        await rename(archive, this.p.storage.backupPath(id));
        syncDirectory(join(this.p.storage.root, 'backups'));
        this.p.write(
          (tx) =>
            tx
              .update(backupJobs)
              .set({
                state: 'complete',
                archiveId: id,
                bytes,
                progress: 100,
                errorCode: null,
                updatedAt: Date.now(),
              })
              .where(eq(backupJobs.id, id))
              .run(),
          lease,
        );
        complete = true;
      });
      this.metrics.set(id, {
        captureMs,
        elapsedMs: Math.round(performance.now() - started),
        estimatedPeakBytes: estimate,
        workerPeakRssKiB: counts.peakRssKiB,
      });
      if (this.metrics.size > 10)
        this.metrics.delete(this.metrics.keys().next().value!);
    } catch (error) {
      if (!complete) await rm(this.p.storage.backupPath(id), { force: true });
      // Free incomplete scratch/archive bytes before trying to persist failure:
      // otherwise a real full filesystem can prevent that tiny catalog update.
      if (stage) {
        await rm(stage, { recursive: true, force: true, maxRetries: 3 });
        stage = undefined;
      }
      const code =
        error instanceof DomainError
          ? error.code
          : ['ENOSPC', 'SQLITE_FULL'].includes(
                (error as NodeJS.ErrnoException)?.code ?? '',
              )
            ? 'storage-full'
            : signal.aborted
              ? 'timeout'
              : 'backup-failed';
      await this.update(id, 'failed', 0, code);
    } finally {
      try {
        if (stage)
          await rm(stage, { recursive: true, force: true, maxRetries: 3 });
      } finally {
        release?.();
      }
    }
  }
  async download(
    identity: SessionIdentity,
    id: string,
    input: unknown,
  ): Promise<Response> {
    if (!idSchema.safeParse(id).success)
      throw new DomainError('not-found', 'err.backupNotFound');
    const parsed = backupDownloadSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidBackupDownloadRequest');
    return this.p.coordinator.writeAsync(async (lease) => {
      const path = this.p.storage.backupPath(id);
      const handle = await open(path, 'r').catch(() => {
        throw new DomainError('not-found', 'err.completedBackupNotFound');
      });
      try {
        const stat = await handle.stat();
        this.p.write((tx) => {
          assertSessionIdentity(tx, identity);
          const row = tx
            .select()
            .from(backupJobs)
            .where(and(eq(backupJobs.id, id), eq(backupJobs.state, 'complete')))
            .get();
          if (!row || !stat.isFile() || stat.size !== row.bytes)
            throw new DomainError('not-found', 'err.completedBackupNotFound');
        }, lease);
        return new Response(
          Readable.toWeb(
            handle.createReadStream(),
          ) as ReadableStream<Uint8Array>,
          {
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': String(stat.size),
              'content-disposition': downloadDisposition(`pandanote-${id}.pnb`),
              'cache-control': 'private, no-store',
              'x-content-type-options': 'nosniff',
              'content-security-policy': "sandbox; default-src 'none'",
            },
          },
        );
      } catch (error) {
        await handle.close();
        throw error;
      }
    });
  }
  async delete(
    identity: SessionIdentity,
    id: string,
    input: unknown,
  ): Promise<void> {
    if (!idSchema.safeParse(id).success)
      throw new DomainError('validation', 'err.invalidBackupId');
    const parsed = backupDeleteSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.confirmBackupDeletion');
    await this.p.coordinator.writeAsync(async (lease) => {
      this.p.write((tx) => {
        assertSessionIdentity(tx, identity);
        const row = tx
          .select()
          .from(backupJobs)
          .where(eq(backupJobs.id, id))
          .get();
        if (row && !['complete', 'failed'].includes(row.state))
          throw new DomainError('busy', 'err.waitUntilThisBackupFinishes');
      }, lease);
      await rm(this.p.storage.backupPath(id), { force: true });
      syncDirectory(join(this.p.storage.root, 'backups'));
      this.p.write(
        (tx) => tx.delete(backupJobs).where(eq(backupJobs.id, id)).run(),
        lease,
      );
    });
  }
}
