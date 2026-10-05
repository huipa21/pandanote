import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
  createReadStream,
} from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { and, count, eq } from 'drizzle-orm';
import { DomainError, idSchema } from '../../shared/domain.ts';
import {
  cleanupUploadsSchema,
  retryCleanupSchema,
  UNUSED_UPLOAD_QUIET_MS,
} from '../../shared/storage.ts';
import { enqueueAttachmentCleanup } from '../maintenance/cleanup.ts';
import { runAttachmentCleanup } from './cleanup.ts';
import {
  initializeBatchSchema,
  type InitializeBatchResult,
  type ReadyAttachment,
  type UploadBatchDto,
} from '../../shared/attachments.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity as assertUploadIdentity } from '../auth/identity.ts';
import type {
  Persistence,
  DomainDatabase,
  DomainTransaction,
} from '../db/connection.ts';
import {
  attachments,
  uploadBatches,
  noteAttachments,
  fileCleanupJobs,
} from '../db/schema.ts';
import { findReceipt } from '../db/receipts.ts';
import { readSettings } from '../settings/repository.ts';
import { syncDirectory, rejectSymlinks } from '../storage/private-storage.ts';
import { DiskBudget } from './resources.ts';
import { processImage, fileMime } from './images.ts';
import { receive, checksum, syncFile, downloadDisposition } from './files.ts';

type AttachmentRow = typeof attachments.$inferSelect;
type Reader = DomainDatabase | DomainTransaction;
function validId(id: string): void {
  if (!idSchema.safeParse(id).success)
    throw new DomainError('validation', 'Invalid attachment or batch ID.');
}
export function attachmentDto(row: AttachmentRow): ReadyAttachment {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.originalFilename,
    mime: row.detectedMime,
    incomingBytes: row.incomingBytes,
    readiness: row.readiness,
    storedBytes:
      (row.displayBytes ?? 0) +
      (row.thumbnailBytes ?? 0) +
      (row.fileBytes ?? 0),
    width: row.width,
    height: row.height,
    thumbnailWidth: row.thumbnailWidth,
    thumbnailHeight: row.thumbnailHeight,
  };
}
function mismatch(): never {
  throw new DomainError(
    'mutation-mismatch',
    'This retry has different files or content. Start a new posting attempt.',
  );
}

export class AttachmentService {
  private readonly p: Persistence;
  private readonly disk: DiskBudget;
  private readonly active = new Set<string>();
  constructor(p: Persistence, disk = new DiskBudget(p.storage.root)) {
    this.p = p;
    this.disk = disk;
    this.recoverTemporaryFiles();
  }
  private batch(db: Reader, identity: SessionIdentity, id: string) {
    validId(id);
    assertUploadIdentity(db, identity);
    const batch = db
      .select()
      .from(uploadBatches)
      .where(
        and(
          eq(uploadBatches.id, id),
          eq(uploadBatches.accountId, identity.account.id),
        ),
      )
      .get();
    if (!batch) throw new DomainError('not-found', 'Upload batch not found.');
    return batch;
  }
  private batchDto(
    db: Reader,
    identity: SessionIdentity,
    id: string,
  ): UploadBatchDto {
    const row = this.batch(db, identity, id);
    return {
      id: row.id,
      status: row.status,
      attachments: db
        .select()
        .from(attachments)
        .where(eq(attachments.batchId, id))
        .all()
        .map(attachmentDto),
    };
  }
  initialize(identity: SessionIdentity, input: unknown): InitializeBatchResult {
    const parsed = initializeBatchSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        'validation',
        'Invalid frozen upload manifest. Check IDs, filenames, sizes and checksums.',
      );
    const value = parsed.data;
    return this.p.write((tx) => {
      assertUploadIdentity(tx, identity);
      const receipt = findReceipt(
        tx,
        identity.account.id,
        value.mutationId,
        value.requestDigest,
      );
      if (receipt) return { state: 'confirmed', result: receipt };
      // A later limits change cannot hide a previously committed note's success.
      // Only new/uncommitted attempts need current upload admission validation.
      const settings = readSettings(this.p);
      if (
        value.items.length > settings.maxAttachmentsPerNote ||
        value.items.some(
          (item) =>
            item.incomingBytes >
            Math.max(settings.fileMaxBytes, settings.imageInputMaxBytes),
        )
      )
        throw new DomainError(
          'validation',
          'The upload manifest exceeds the attachment limits.',
        );
      const existing = tx
        .select()
        .from(uploadBatches)
        .where(eq(uploadBatches.mutationId, value.mutationId))
        .get();
      if (existing) {
        if (
          existing.accountId !== identity.account.id ||
          existing.requestDigest !== value.requestDigest
        )
          mismatch();
        const rows = tx
          .select()
          .from(attachments)
          .where(eq(attachments.batchId, existing.id))
          .all();
        if (
          rows.length !== value.items.length ||
          rows.some(
            (row) =>
              !value.items.some(
                (item) =>
                  item.id === row.id &&
                  item.filename === row.originalFilename &&
                  item.incomingBytes === row.incomingBytes &&
                  item.incomingDigest === row.incomingDigest,
              ),
          )
        )
          mismatch();
        if (existing.status !== 'pending')
          throw new DomainError(
            'conflict',
            'This batch is no longer accepting uploads. Start a new posting attempt.',
          );
        tx.update(uploadBatches)
          .set({ activityAt: Date.now() })
          .where(eq(uploadBatches.id, existing.id))
          .run();
        return {
          state: 'batch',
          batch: this.batchDto(tx, identity, existing.id),
        };
      }
      // Bound uncommitted metadata as well as native/stream work; explicit cleanup
      // of abandoned retry files is exposed for S15, never timed automatic deletion.
      const pendingCount = tx
        .select({ value: count() })
        .from(uploadBatches)
        .where(eq(uploadBatches.status, 'pending'))
        .get()!.value;
      if (pendingCount >= 100)
        throw new DomainError(
          'busy',
          'Too many pending posting attempts. Clean unused uploads in Storage settings before retrying.',
        );
      for (const item of value.items)
        if (
          tx
            .select({ id: attachments.id })
            .from(attachments)
            .where(eq(attachments.id, item.id))
            .get()
        )
          mismatch();
      const id = randomUUID();
      const now = Date.now();
      tx.insert(uploadBatches)
        .values({
          id,
          accountId: identity.account.id,
          mutationId: value.mutationId,
          requestDigest: value.requestDigest,
          status: 'pending',
          createdAt: now,
          activityAt: now,
        })
        .run();
      for (const item of value.items)
        tx.insert(attachments)
          .values({
            id: item.id,
            kind: 'file',
            originalFilename: item.filename,
            detectedMime: 'application/octet-stream',
            incomingBytes: item.incomingBytes,
            incomingDigest: item.incomingDigest,
            readiness: 'pending',
            batchId: id,
            createdAt: now,
          })
          .run();
      return { state: 'batch', batch: this.batchDto(tx, identity, id) };
    });
  }
  status(identity: SessionIdentity, id: string): UploadBatchDto {
    return this.batchDto(this.p.db, identity, id);
  }
  private item(
    db: Reader,
    identity: SessionIdentity,
    batchId: string,
    id: string,
  ): AttachmentRow {
    const batch = this.batch(db, identity, batchId);
    if (batch.status !== 'pending')
      throw new DomainError('conflict', 'This batch is not accepting uploads.');
    validId(id);
    const row = db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.batchId, batchId)))
      .get();
    if (
      !row ||
      db
        .select()
        .from(fileCleanupJobs)
        .where(eq(fileCleanupJobs.attachmentId, id))
        .get()
    )
      throw new DomainError('not-found', 'Upload item not found.');
    return row;
  }
  async upload(
    identity: SessionIdentity,
    batchId: string,
    id: string,
    request: Request,
  ): Promise<ReadyAttachment> {
    const row = this.item(this.p.db, identity, batchId, id);
    const settings = readSettings(this.p);
    const declared = request.headers.get('content-length');
    if (
      declared &&
      (!/^\d+$/.test(declared) || Number(declared) !== row.incomingBytes)
    )
      throw new DomainError(
        'validation',
        'Upload size does not match the frozen file.',
      );
    const hint =
      request.headers.get('content-type')?.split(';')[0].trim() ?? '';
    const imageHint = hint.startsWith('image/');
    if (imageHint && hint === 'image/svg+xml')
      throw new DomainError(
        'validation',
        'SVG is supported only as a downloadable file. Upload it as application/octet-stream.',
      );
    if (
      row.incomingBytes >
      (imageHint
        ? settings.imageInputMaxBytes
        : Math.max(settings.fileMaxBytes, settings.imageInputMaxBytes))
    )
      throw new DomainError(
        'validation',
        'File exceeds the upload byte limit.',
      );
    if (this.active.has(id) || this.active.size >= 3)
      throw new DomainError(
        'busy',
        'Uploads are busy. Query readiness and retry shortly.',
      );
    this.active.add(id);
    try {
      return await this.p.coordinator.writeAsync(async (lease) => {
        // Renew activity before receiving, including failed/duplicate transfers.
        // Explicit cleanup refuses active IDs and recently resumed attempts.
        this.p.write((tx) => {
          this.item(tx, identity, batchId, id);
          tx.update(uploadBatches)
            .set({ activityAt: Date.now() })
            .where(eq(uploadBatches.id, batchId))
            .run();
        }, lease);
        const finalDirectory = dirname(
          this.p.storage.attachmentPath(id, 'attachment.bin'),
        );
        const releaseDisk = this.disk.claim(
          row.incomingBytes +
            4 *
              (settings.displayMaxEdge ** 2 + settings.thumbnailMaxEdge ** 2) +
            1024 * 1024,
        );
        let staging: string;
        try {
          staging = this.p.storage.stagingDirectory('uploads', randomUUID());
        } catch (error) {
          releaseDisk();
          throw error;
        }
        const original = join(staging, 'original.tmp');
        const output = join(staging, 'ready');
        let installed = false;
        let confirmed = false;
        try {
          const received = await receive(
            request.body,
            original,
            row.incomingBytes,
            settings.fileMaxBytes,
            settings.imageInputMaxBytes,
            imageHint,
          );
          if (received.digest !== row.incomingDigest) mismatch();
          if (imageHint && !received.raster)
            throw new DomainError(
              'validation',
              'The upload is not a supported raster image.',
            );
          if (row.readiness === 'ready') {
            const current = this.item(this.p.db, identity, batchId, id);
            if (current.readiness !== 'ready')
              throw new DomainError(
                'conflict',
                'Upload readiness changed. Retry the posting attempt.',
              );
            return attachmentDto(current); // A duplicate PUT still validates bytes, never overwrites.
          }
          mkdirSync(output, { mode: 0o700 });
          let values: Partial<typeof attachments.$inferInsert>;
          if (received.raster) {
            const display = join(output, 'display.webp');
            const thumbnail = join(output, 'thumbnail.webp');
            const result = await processImage(
              original,
              display,
              thumbnail,
              settings,
            );
            const d = await checksum(display);
            const t = await checksum(thumbnail);
            values = {
              kind: 'image',
              detectedMime: result.mime,
              width: result.width,
              height: result.height,
              thumbnailWidth: result.thumbnailWidth,
              thumbnailHeight: result.thumbnailHeight,
              displayBytes: d.bytes,
              displayDigest: d.digest,
              thumbnailBytes: t.bytes,
              thumbnailDigest: t.digest,
              fileBytes: null,
              fileDigest: null,
            };
          } else {
            if (received.bytes > settings.fileMaxBytes)
              throw new DomainError(
                'validation',
                'File exceeds the byte limit.',
              );
            await rename(original, join(output, 'attachment.bin'));
            values = {
              kind: 'file',
              detectedMime: fileMime(received.head),
              fileBytes: received.bytes,
              fileDigest: received.digest,
              displayBytes: null,
              displayDigest: null,
              width: null,
              height: null,
              thumbnailBytes: null,
              thumbnailDigest: null,
              thumbnailWidth: null,
              thumbnailHeight: null,
            };
          }
          for (const name of readdirSync(output)) {
            const path = join(output, name);
            chmodSync(path, 0o600);
            await syncFile(path);
          }
          syncDirectory(output);
          // Remove the original BEFORE publishing ready metadata, not after success.
          await rm(original, { force: true });
          this.item(this.p.db, identity, batchId, id); // Recheck revocation/status before filesystem installation.
          if (existsSync(finalDirectory)) {
            // A prior failed installation may have survived a failed unlink.
            // The per-ID lock plus non-ready row permits safe retry cleanup.
            await rm(finalDirectory, { recursive: true, force: true });
          }
          await rename(output, finalDirectory);
          installed = true;
          syncDirectory(dirname(finalDirectory));
          const ready = this.p.write((tx) => {
            this.item(tx, identity, batchId, id);
            tx.update(attachments)
              .set({ ...values, readiness: 'ready' })
              .where(eq(attachments.id, id))
              .run();
            tx.update(uploadBatches)
              .set({ activityAt: Date.now() })
              .where(eq(uploadBatches.id, batchId))
              .run();
            return attachmentDto(
              tx
                .select()
                .from(attachments)
                .where(eq(attachments.id, id))
                .get()!,
            );
          }, lease);
          confirmed = true;
          return ready;
        } catch (error) {
          if (!confirmed && row.readiness !== 'ready')
            this.p.write((tx) => {
              tx.update(attachments)
                .set({ readiness: 'failed' })
                .where(
                  and(eq(attachments.id, id), eq(attachments.batchId, batchId)),
                )
                .run();
            }, lease);
          if (error instanceof DomainError) throw error;
          if ((error as NodeJS.ErrnoException).code === 'ENOSPC')
            throw new DomainError(
              'storage-full',
              'The disk is full. Free space and retry; your local files are still needed.',
            );
          throw new DomainError(
            'upload-failed',
            'Upload could not be stored. Keep the local file and retry.',
            { cause: error },
          );
        } finally {
          try {
            if (installed && !confirmed) {
              await rm(finalDirectory, { recursive: true, force: true });
              syncDirectory(dirname(finalDirectory));
            }
            await rm(staging, { recursive: true, force: true });
          } finally {
            releaseDisk();
          }
        }
      });
    } finally {
      this.active.delete(id);
    }
  }
  /** Startup only: immutable ready retry outputs survive; all temporary originals
   * and crash-installed outputs without a ready row are discarded. */
  private recoverTemporaryFiles(): void {
    this.p.coordinator.write(() => {
      const staging = join(this.p.storage.root, 'staging', 'uploads');
      for (const name of readdirSync(staging)) {
        idSchema.parse(name);
        const path = join(staging, name);
        rejectSymlinks(path);
        rmSync(path, { recursive: true, force: true });
      }
      const files = join(this.p.storage.root, 'files');
      for (const name of readdirSync(files)) {
        idSchema.parse(name);
        const path = join(files, name);
        rejectSymlinks(path);
        const row = this.p.db
          .select()
          .from(attachments)
          .where(eq(attachments.id, name))
          .get();
        if (!row || row.readiness !== 'ready')
          rmSync(path, { recursive: true, force: true });
      }
      syncDirectory(staging);
      syncDirectory(files);
    });
  }
  /** Explicitly abandon entire quiet attempts, never individual files from an
   * otherwise retryable frozen manifest. Selection is activity-bound and all-or-none.
   * Queueing + abandonment is atomic; durable deletion may be retried after crash.
   * Replays of the same abandoned batch are safe without touching newer attempts. */
  async cleanupUnused(
    identity: SessionIdentity,
    input: unknown,
  ): Promise<{ remainingJobs: number }> {
    const retry = retryCleanupSchema.safeParse(input);
    const parsed = cleanupUploadsSchema.safeParse(input);
    if (!retry.success && !parsed.success)
      throw new DomainError(
        'validation',
        'Confirm the selected unused posting attempts.',
      );
    this.p.write((tx) => {
      assertUploadIdentity(tx, identity);
      const now = Date.now();
      for (const selected of parsed.success ? parsed.data.batches : []) {
        const batch = this.batch(tx, identity, selected.id);
        const rows = tx
          .select()
          .from(attachments)
          .where(eq(attachments.batchId, batch.id))
          .all();
        if (
          batch.activityAt !== selected.activityAt ||
          (batch.status !== 'pending' && batch.status !== 'abandoned') ||
          batch.activityAt > now - UNUSED_UPLOAD_QUIET_MS ||
          rows.some(
            (row) =>
              this.active.has(row.id) ||
              tx
                .select()
                .from(noteAttachments)
                .where(eq(noteAttachments.attachmentId, row.id))
                .get(),
          )
        )
          throw new DomainError(
            'conflict',
            'A selected attempt is active, recently resumed, or referenced. Refresh storage before choosing again. Nothing from this selection was queued.',
          );
        tx.update(uploadBatches)
          .set({ status: 'abandoned' })
          .where(eq(uploadBatches.id, batch.id))
          .run();
        for (const row of rows) enqueueAttachmentCleanup(tx, row.id);
      }
    });
    await runAttachmentCleanup(this.p);
    return {
      remainingJobs: this.p.db
        .select({ value: count() })
        .from(fileCleanupJobs)
        .get()!.value,
    };
  }
  /** Read-only inventory; no automatic expiry of ready retries. */
  unusedReady(identity: SessionIdentity): ReadyAttachment[] {
    assertUploadIdentity(this.p.db, identity);
    return this.p.db
      .select()
      .from(attachments)
      .where(eq(attachments.readiness, 'ready'))
      .all()
      .filter(
        (row) =>
          !this.p.db
            .select()
            .from(noteAttachments)
            .where(eq(noteAttachments.attachmentId, row.id))
            .get() &&
          !this.p.db
            .select()
            .from(fileCleanupJobs)
            .where(eq(fileCleanupJobs.attachmentId, row.id))
            .get(),
      )
      .map(attachmentDto);
  }
  async download(
    identity: SessionIdentity,
    id: string,
    variant: string,
    download = false,
    head = false,
  ): Promise<Response> {
    validId(id);
    assertUploadIdentity(this.p.db, identity);
    const row = this.p.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .get();
    if (
      !row ||
      row.readiness !== 'ready' ||
      this.p.db
        .select()
        .from(fileCleanupJobs)
        .where(eq(fileCleanupJobs.attachmentId, id))
        .get()
    )
      throw new DomainError('not-found', 'Attachment not found.');
    // Notes have one account; pending files must belong to this account's batch.
    const referenced = this.p.db
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.attachmentId, id))
      .get();
    const batch =
      row.batchId &&
      this.p.db
        .select()
        .from(uploadBatches)
        .where(eq(uploadBatches.id, row.batchId))
        .get();
    if (
      !referenced &&
      (!batch ||
        batch.accountId !== identity.account.id ||
        batch.status !== 'pending')
    )
      throw new DomainError('not-found', 'Attachment not found.');
    const image = row.kind === 'image';
    if (
      !(image ? ['display', 'thumbnail'].includes(variant) : variant === 'file')
    )
      throw new DomainError('not-found', 'Attachment variant not found.');
    const path = this.p.storage.attachmentPath(
      id,
      image
        ? variant === 'display'
          ? 'display.webp'
          : 'thumbnail.webp'
        : 'attachment.bin',
    );
    // Open before returning; a missing/failed file never yields a bogus HTTP 200.
    const stream = createReadStream(path);
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', () =>
        reject(
          new DomainError('not-found', 'Stored attachment is unavailable.'),
        ),
      );
    });
    const headers: Record<string, string> = {
      'content-type': image ? 'image/webp' : 'application/octet-stream',
      'content-length': String(
        image
          ? variant === 'display'
            ? row.displayBytes
            : row.thumbnailBytes
          : row.fileBytes,
      ),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy':
        "default-src 'none'; sandbox; frame-ancestors 'none'",
    };
    if (!image || download)
      headers['content-disposition'] = downloadDisposition(
        image ? `${id}.webp` : row.originalFilename,
      );
    if (head) {
      await new Promise<void>((resolve) => {
        stream.once('close', resolve);
        stream.destroy();
      });
      return new Response(null, { headers });
    }
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers,
    });
  }
}
