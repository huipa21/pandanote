import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { and, asc, count, eq, isNotNull } from 'drizzle-orm';
import {
  DomainError,
  idSchema,
  transitionNote,
  validateTimelineAt,
  type MutationResult,
  type NoteSnapshot,
} from '../../shared/domain.ts';
import {
  canonicalNoteMutation,
  MAX_PINNED_NOTES,
  noteMutationSchema,
  type NoteContent,
  type NoteMutation,
} from '../../shared/notes.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import type { Persistence, DomainTransaction } from '../db/connection.ts';
import {
  notes,
  attachments,
  noteAttachments,
  tags,
  noteTags,
  uploadBatches,
  fileCleanupJobs,
} from '../db/schema.ts';
import { findReceipt, insertReceipt } from '../db/receipts.ts';
import { readSettings } from '../settings/repository.ts';
import { enqueueAttachmentCleanup } from '../maintenance/cleanup.ts';
import { inspectContent } from './content.ts';
import { attachmentDto } from '../attachments/service.ts';
import { refreshNoteSearch, removeNoteSearch } from '../search/index.ts';
import { assertCurrentTags } from '../tags/service.ts';

export function noteMutationDigest(value: NoteMutation): string {
  return createHash('sha256')
    .update(canonicalNoteMutation(value), 'utf8')
    .digest('hex');
}
export class NoteConflictError extends DomainError {
  readonly snapshot: NoteSnapshot;
  constructor(snapshot: NoteSnapshot) {
    super('conflict', 'err.noteChangedCompare');
    this.snapshot = snapshot;
  }
}
import { assertNoteVisible, visibleAttachment } from '../auth/vault.ts';

type NoteRow = typeof notes.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;
type Reader = Persistence['db'] | DomainTransaction;
function rowFor(db: Reader, id: string): NoteRow {
  const row = db.select().from(notes).where(eq(notes.id, id)).get();
  if (!row) throw new DomainError('not-found', 'err.noteNotFoundKeepYour');
  return row;
}
function linkedIds(db: Reader, id: string): string[] {
  return db
    .select({ id: noteAttachments.attachmentId })
    .from(noteAttachments)
    .where(eq(noteAttachments.noteId, id))
    .orderBy(asc(noteAttachments.ordinal))
    .all()
    .map((row) => row.id);
}
function snapshot(db: Reader, row: NoteRow): NoteSnapshot {
  return {
    id: row.id,
    bodyMarkdown: row.bodyMarkdown,
    isPrivate: row.isPrivate,
    status: row.status,
    priorStatus: row.priorStatus,
    timelineAt: row.timelineAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contentEditedAt: row.contentEditedAt,
    revision: row.revision,
    pinnedAt: row.pinnedAt,
    attachmentIds: linkedIds(db, row.id),
    attachments: db
      .select({ attachment: attachments })
      .from(noteAttachments)
      .innerJoin(attachments, eq(noteAttachments.attachmentId, attachments.id))
      .where(eq(noteAttachments.noteId, row.id))
      .orderBy(asc(noteAttachments.ordinal))
      .all()
      .map(({ attachment }) => attachmentDto(attachment)),
    tags: db
      .select({ key: tags.normalizedKey })
      .from(noteTags)
      .innerJoin(tags, eq(noteTags.tagId, tags.id))
      .where(eq(noteTags.noteId, row.id))
      .orderBy(asc(tags.normalizedKey))
      .all()
      .map((tag) => tag.key),
  };
}

export class NoteService {
  private readonly p: Persistence;
  constructor(p: Persistence) {
    this.p = p;
  }
  get(identity: SessionIdentity, id: string): NoteSnapshot {
    if (!idSchema.safeParse(id).success)
      throw new DomainError('validation', 'err.invalidNoteId');
    // A read transaction keeps body/revision/joins in the same snapshot even if
    // another connection writes between reads. It makes no content mutations.
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const row = rowFor(tx, id);
      assertNoteVisible(tx, identity, row);
      return snapshot(tx, row);
    });
  }
  mutate(identity: SessionIdentity, input: unknown): MutationResult {
    const parsed = noteMutationSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidNoteActionContentDate');
    const value = parsed.data;
    const digest = noteMutationDigest(value);
    return this.p.write((tx) => {
      assertSessionIdentity(tx, identity);
      // Before revision/status/files/time checks: retry returns the ORIGINAL
      // success even after further edits, byte cleanup or permanent deletion.
      const receipt = findReceipt(
        tx,
        identity.account.id,
        value.mutationId,
        digest,
      );
      if (receipt) return receipt;
      const old = value.action === 'create' ? null : rowFor(tx, value.noteId);
      if (old) assertNoteVisible(tx, identity, old);
      if (
        old &&
        value.action !== 'create' &&
        old.revision !== value.expectedRevision
      )
        throw new NoteConflictError(snapshot(tx, old));
      if (old?.revision === Number.MAX_SAFE_INTEGER)
        throw new DomainError('validation', 'err.thisNoteCannotAcceptAnother');
      const batch = tx
        .select()
        .from(uploadBatches)
        .where(eq(uploadBatches.mutationId, value.mutationId))
        .get();
      if (
        batch &&
        (batch.accountId !== identity.account.id ||
          batch.requestDigest !== digest ||
          batch.status !== 'pending')
      )
        throw new DomainError(
          'mutation-mismatch',
          'err.thisPostingAttemptDoesNot',
        );
      if (!('content' in value) && batch)
        throw new DomainError('validation', 'err.aStatusActionCannotCommit');
      const now = Math.max(Date.now(), old?.updatedAt ?? 0);
      const noteId = old?.id ?? randomUUID();
      const revision = (old?.revision ?? 0) + 1;
      const previousIds = old ? linkedIds(tx, old.id) : [];
      let status = old?.status ?? 'published';
      if ('content' in value) {
        if (value.action === 'update' && old?.status !== 'published')
          throw new DomainError(
            'validation',
            'err.publishedNotesUseSaveChanges',
          );
        const content = value.content;
        if (value.action !== 'create' && content.timelineAt === null)
          throw new DomainError(
            'validation',
            'err.keepTheOriginalTimelineDate',
          );
        const timelineAt =
          content.timelineAt === null
            ? now
            : validateTimelineAt(content.timelineAt, Date.now());
        const settings = readSettings(this.p);
        if (
          Buffer.byteLength(content.bodyMarkdown, 'utf8') >
            settings.markdownMaxBytes ||
          content.attachmentIds.length > settings.maxAttachmentsPerNote
        )
          throw new DomainError(
            'validation',
            'err.thisNoteExceedsTheConfigured',
          );
        const rows = this.readyAttachments(tx, identity, content, batch?.id);
        if (!content.bodyMarkdown.trim() && rows.length === 0)
          throw new DomainError('validation', 'err.addTextOrAReady');
        const extracted = inspectContent(
          content.bodyMarkdown,
          new Set(rows.filter((r) => r.kind === 'image').map((r) => r.id)),
        );
        assertCurrentTags(
          tx,
          extracted.map((t) => t.key),
          content.tagAcknowledgements,
        );
        if (batch) {
          const batchIds = tx
            .select({ id: attachments.id })
            .from(attachments)
            .where(eq(attachments.batchId, batch.id))
            .all();
          if (batchIds.some((r) => !content.attachmentIds.includes(r.id)))
            throw new DomainError('validation', 'err.allFrozenBatchFilesMust');
        }
        const changed =
          old &&
          (old.bodyMarkdown !== content.bodyMarkdown ||
            JSON.stringify(previousIds) !==
              JSON.stringify(content.attachmentIds));
        const fields = {
          isPrivate: content.isPrivate ?? old?.isPrivate ?? false,
          bodyMarkdown: content.bodyMarkdown,
          timelineAt,
          updatedAt: now,
          contentEditedAt: changed ? now : (old?.contentEditedAt ?? null),
          revision,
          status: 'published' as const,
          priorStatus: null,
          pinnedAt: old?.pinnedAt ?? null,
        };
        if (old) this.update(tx, old, fields);
        else
          tx.insert(notes)
            .values({ ...fields, id: noteId, createdAt: now })
            .run();
        tx.delete(noteAttachments)
          .where(eq(noteAttachments.noteId, noteId))
          .run();
        rows.forEach((row, ordinal) =>
          tx
            .insert(noteAttachments)
            .values({ noteId, attachmentId: row.id, ordinal })
            .run(),
        );
        tx.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();
        for (const tag of extracted) {
          tx.insert(tags)
            .values({
              id: randomUUID(),
              normalizedKey: tag.key,
              display: tag.spelling,
            })
            .onConflictDoNothing()
            .run();
          const registry = tx
            .select()
            .from(tags)
            .where(eq(tags.normalizedKey, tag.key))
            .get()!;
          tx.insert(noteTags).values({ noteId, tagId: registry.id }).run();
        }

        if (batch)
          tx.update(uploadBatches)
            .set({ status: 'committed', activityAt: now })
            .where(eq(uploadBatches.id, batch.id))
            .run();
        status = 'published';
        this.enqueueUnused(
          tx,
          previousIds.filter((id) => !content.attachmentIds.includes(id)),
        );
      } else {
        if (!old) throw new Error('Missing existing note');
        if (value.action === 'permanent-delete') {
          if (old.status !== 'trash')
            throw new DomainError('validation', 'err.moveTheNoteToTrash');
          // Remove the rowid-linked FTS row before the derived FK cascade.
          removeNoteSearch(tx, old.id);
          tx.delete(notes)
            .where(
              and(
                eq(notes.id, old.id),
                eq(notes.revision, value.expectedRevision),
              ),
            )
            .run();
          this.enqueueUnused(tx, previousIds);
        } else if (value.action === 'pin' || value.action === 'unpin') {
          if (value.action === 'pin') {
            if (old.status !== 'published' || old.pinnedAt !== null)
              throw new DomainError(
                'validation',
                'err.onlyAnUnpinnedPublishedNote',
              );
            if (
              tx
                .select({ n: count() })
                .from(notes)
                .where(isNotNull(notes.pinnedAt))
                .get()!.n >= MAX_PINNED_NOTES
            )
              throw new DomainError('validation', 'err.pinLimit', {
                params: { max: MAX_PINNED_NOTES },
              });
          } else if (old.pinnedAt === null)
            throw new DomainError('validation', 'err.thisNoteIsNotPinned');
          this.update(tx, old, {
            pinnedAt: value.action === 'pin' ? now : null,
            revision,
            updatedAt: now,
          });
        } else {
          const next = transitionNote(
            old.status,
            old.priorStatus,
            value.action,
          );
          // Trash always unpins; restore returns an unpinned note.
          this.update(tx, old, {
            ...next,
            pinnedAt: null,
            revision,
            updatedAt: now,
          });

          status = next.status;
        }
      }
      refreshNoteSearch(tx, noteId);
      const result: MutationResult = {
        noteId,
        revision,
        status,
        deleted: value.action === 'permanent-delete',
      };
      insertReceipt(tx, identity.account.id, value.mutationId, digest, result);
      return result;
    });
  }
  private update(
    tx: DomainTransaction,
    old: NoteRow,
    fields: Partial<typeof notes.$inferInsert>,
  ): void {
    if (
      tx
        .update(notes)
        .set(fields)
        .where(and(eq(notes.id, old.id), eq(notes.revision, old.revision)))
        .run().changes !== 1
    )
      throw new NoteConflictError(snapshot(tx, rowFor(tx, old.id)));
  }
  private enqueueUnused(tx: DomainTransaction, ids: string[]): void {
    for (const id of ids)
      if (
        !tx
          .select()
          .from(noteAttachments)
          .where(eq(noteAttachments.attachmentId, id))
          .limit(1)
          .get()
      )
        enqueueAttachmentCleanup(tx, id);
  }
  private readyAttachments(
    tx: DomainTransaction,
    identity: SessionIdentity,
    content: NoteContent,
    batchId?: string,
  ): AttachmentRow[] {
    return content.attachmentIds.map((id) => {
      const row = tx
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .get();
      const referenced = tx
        .select()
        .from(noteAttachments)
        .where(eq(noteAttachments.attachmentId, id))
        .limit(1)
        .get();
      // All referenced files (including Trash) belong to the singleton account,
      // permitting conflict-copy reuse. Uncommitted files require THIS attempt.
      if (
        !row ||
        row.readiness !== 'ready' ||
        (referenced && !visibleAttachment(tx, identity, id)) ||
        (!referenced && (!batchId || row.batchId !== batchId)) ||
        tx
          .select()
          .from(fileCleanupJobs)
          .where(eq(fileCleanupJobs.attachmentId, id))
          .get()
      )
        throw new DomainError('validation', 'err.anAttachmentIsMissingUnready');
      assertSessionIdentity(tx, identity);
      const variants =
        row.kind === 'image'
          ? ([
              ['display.webp', row.displayBytes],
              ['thumbnail.webp', row.thumbnailBytes],
            ] as const)
          : ([['attachment.bin', row.fileBytes]] as const);
      try {
        for (const [variant, bytes] of variants) {
          const stat = lstatSync(this.p.storage.attachmentPath(id, variant));
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes)
            throw new Error('Invalid stored variant');
        }
      } catch {
        throw new DomainError(
          'validation',
          'err.aStoredAttachmentIsUnavailable',
        );
      }
      return row;
    });
  }
}
