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
  renameAttachmentSchema,
  isVoiceMime,
  VOICE_PENDING_MIME,
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
  notes as noteRows,
  uploadBatches,
  noteAttachments,
  fileCleanupJobs,
} from '../db/schema.ts';
import { findReceipt } from '../db/receipts.ts';
import { visibleAttachment, vaultState } from '../auth/vault.ts';
import { refreshNoteSearch } from '../search/index.ts';
import { readSettings } from '../settings/repository.ts';
import { syncDirectory, rejectSymlinks } from '../storage/private-storage.ts';
import { DiskBudget } from './resources.ts';
import { processImage, fileMime, voiceMime } from './images.ts';
import {
  receive,
  checksum,
  syncFile,
  downloadDisposition,
  parseRange,
} from './files.ts';

type AttachmentRow = typeof attachments.$inferSelect;
type Reader = DomainDatabase | DomainTransaction;
function validId(id: string): void {
  if (!idSchema.safeParse(id).success)
    throw new DomainError('validation', 'err.invalidAttachmentOrBatchId');
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
  throw new DomainError('mutation-mismatch', 'err.thisRetryHasDifferentFiles');
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
    if (!batch) throw new DomainError('not-found', 'err.uploadBatchNotFound');
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
        'err.invalidFrozenUploadManifestCheck',
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
        throw new DomainError('validation', 'err.theUploadManifestExceedsThe');
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
                  item.incomingDigest === row.incomingDigest &&
                  (item.voice === true) ===
                    row.detectedMime.startsWith('audio/'),
              ),
          )
        )
          mismatch();
        if (existing.status !== 'pending')
          throw new DomainError('conflict', 'err.thisBatchIsNoLonger');
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
        throw new DomainError('busy', 'err.tooManyPendingPostingAttempts');
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
            detectedMime: item.voice
              ? VOICE_PENDING_MIME
              : 'application/octet-stream',
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
      throw new DomainError('conflict', 'err.thisBatchIsNotAccepting');
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
      throw new DomainError('not-found', 'err.uploadItemNotFound');
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
      throw new DomainError('validation', 'err.uploadSizeDoesNotMatch');
    const hint =
      request.headers.get('content-type')?.split(';')[0].trim() ?? '';
    const imageHint = hint.startsWith('image/');
    if (imageHint && hint === 'image/svg+xml')
      throw new DomainError('validation', 'err.svgIsSupportedOnlyAs');
    if (
      row.incomingBytes >
      (imageHint
        ? settings.imageInputMaxBytes
        : Math.max(settings.fileMaxBytes, settings.imageInputMaxBytes))
    )
      throw new DomainError('validation', 'err.fileExceedsTheUploadByte');
    if (this.active.has(id) || this.active.size >= 3)
      throw new DomainError('busy', 'err.uploadsAreBusyQueryReadiness');
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
          // A pending `audio/*` marker means the frozen manifest flagged a voice clip.
          const voice = row.detectedMime.startsWith('audio/');
          const raster = received.raster && !voice;
          const audio = voice ? voiceMime(received.head) : null;
          if (voice && !audio)
            throw new DomainError('validation', 'err.theVoiceClipIsNot');
          if (imageHint && !raster)
            throw new DomainError('validation', 'err.theUploadIsNotA');
          if (row.readiness === 'ready') {
            const current = this.item(this.p.db, identity, batchId, id);
            if (current.readiness !== 'ready')
              throw new DomainError(
                'conflict',
                'err.uploadReadinessChangedRetryThe',
              );
            return attachmentDto(current); // A duplicate PUT still validates bytes, never overwrites.
          }
          mkdirSync(output, { mode: 0o700 });
          let values: Partial<typeof attachments.$inferInsert>;
          if (raster) {
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
                'err.fileExceedsTheByteLimit',
              );
            await rename(original, join(output, 'attachment.bin'));
            values = {
              kind: 'file',
              detectedMime: audio ?? fileMime(received.head),
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
            throw new DomainError('storage-full', 'err.theDiskIsFullFree');
          throw new DomainError('upload-failed', 'err.uploadCouldNotBeStored', {
            cause: error,
          });
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
        'err.confirmTheSelectedUnusedPosting',
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
          throw new DomainError('conflict', 'err.aSelectedAttemptIsActive');
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
  /** Rename a saved voice clip. Only the display name changes; the note revision is
   * untouched (content is the same) but the note's filename search is refreshed. */
  rename(
    identity: SessionIdentity,
    id: string,
    input: unknown,
  ): ReadyAttachment {
    validId(id);
    const parsed = renameAttachmentSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidClipName');
    const filename = parsed.data.filename;
    return this.p.write((tx) => {
      assertUploadIdentity(tx, identity);
      const row = tx
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .get();
      const notes = tx
        .select({ id: noteAttachments.noteId })
        .from(noteAttachments)
        .where(eq(noteAttachments.attachmentId, id))
        .all();
      if (
        !row ||
        row.readiness !== 'ready' ||
        !notes.length ||
        (!vaultState(tx, identity).open &&
          tx
            .select({ id: noteRows.id })
            .from(noteAttachments)
            .innerJoin(noteRows, eq(noteRows.id, noteAttachments.noteId))
            .where(
              and(
                eq(noteAttachments.attachmentId, id),
                eq(noteRows.isPrivate, true),
              ),
            )
            .limit(1)
            .get() !== undefined) ||
        tx
          .select()
          .from(fileCleanupJobs)
          .where(eq(fileCleanupJobs.attachmentId, id))
          .get()
      )
        throw new DomainError('not-found', 'err.attachmentNotFound');
      if (row.kind !== 'file' || !isVoiceMime(row.detectedMime))
        throw new DomainError('validation', 'err.onlyVoiceClipsRenamed');
      tx.update(attachments)
        .set({ originalFilename: filename })
        .where(eq(attachments.id, id))
        .run();
      for (const note of notes) refreshNoteSearch(tx, note.id);
      return attachmentDto({ ...row, originalFilename: filename });
    });
  }
  async download(
    identity: SessionIdentity,
    id: string,
    variant: string,
    download = false,
    head = false,
    conditional: { range?: string | null; ifRange?: string | null } = {},
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
      throw new DomainError('not-found', 'err.attachmentNotFound');
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
      (referenced && !visibleAttachment(this.p.db, identity, id)) ||
      (!referenced &&
        (!batch ||
          batch.accountId !== identity.account.id ||
          batch.status !== 'pending'))
    )
      throw new DomainError('not-found', 'err.attachmentNotFound');
    const image = row.kind === 'image';
    if (
      !(image ? ['display', 'thumbnail'].includes(variant) : variant === 'file')
    )
      throw new DomainError('not-found', 'err.attachmentVariantNotFound');
    const path = this.p.storage.attachmentPath(
      id,
      image
        ? variant === 'display'
          ? 'display.webp'
          : 'thumbnail.webp'
        : 'attachment.bin',
    );
    // Voice clips (audio containers verified at upload) play inline with Range.
    const audio = !image && !download && isVoiceMime(row.detectedMime);
    const total = Number(
      image
        ? variant === 'display'
          ? row.displayBytes
          : row.thumbnailBytes
        : row.fileBytes,
    );
    const headers: Record<string, string> = {
      'content-type': image
        ? 'image/webp'
        : audio
          ? row.detectedMime
          : 'application/octet-stream',
      'content-length': String(total),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy':
        "default-src 'none'; sandbox; frame-ancestors 'none'",
    };
    if (audio) {
      headers['accept-ranges'] = 'bytes';
      headers.etag = `"${row.fileDigest}"`;
      headers['content-disposition'] = downloadDisposition(
        row.originalFilename,
        'inline',
      );
    } else if (!image || download)
      headers['content-disposition'] = downloadDisposition(
        image ? `${id}.webp` : row.originalFilename,
      );
    let status = 200;
    let range: { start: number; end: number } | undefined;
    // Without a matching If-Range validator the Range header must be ignored.
    if (audio && (conditional.ifRange ?? headers.etag) === headers.etag) {
      const parsed = parseRange(conditional.range ?? null, total);
      if (parsed === 'unsatisfiable')
        return new Response(null, {
          status: 416,
          headers: {
            ...headers,
            'content-length': '0',
            'content-range': `bytes */${total}`,
          },
        });
      if (parsed !== 'ignore') {
        range = parsed;
        status = 206;
        headers['content-range'] = `bytes ${range.start}-${range.end}/${total}`;
        headers['content-length'] = String(range.end - range.start + 1);
      }
    }
    // Open before returning; a missing/failed file never yields a bogus HTTP 200.
    const stream = createReadStream(path, range);
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', () =>
        reject(
          new DomainError('not-found', 'err.storedAttachmentIsUnavailable'),
        ),
      );
    });
    if (head) {
      await new Promise<void>((resolve) => {
        stream.once('close', resolve);
        stream.destroy();
      });
      return new Response(null, { status, headers });
    }
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status,
      headers,
    });
  }
}
