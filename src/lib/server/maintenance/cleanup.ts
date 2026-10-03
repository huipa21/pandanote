import { eq } from 'drizzle-orm';
import { idSchema, DomainError } from '../../shared/domain.ts';
import { newPrivateId } from '../storage/private-storage.ts';
import type { DomainTransaction } from '../db/connection.ts';
import { attachments, fileCleanupJobs, noteAttachments } from '../db/schema.ts';

/** Enqueue only after committed reference removal, in that same transaction.
 * No filenames/absolute paths are stored. S06/S07 add a restartable worker that
 * rechecks references and removes immutable variants before metadata deletion.
 * A queued attachment cannot gain a new reference (database trigger).
 */
export function enqueueAttachmentCleanup(
  tx: DomainTransaction,
  attachmentId: string,
): string {
  idSchema.parse(attachmentId);
  if (
    tx
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.attachmentId, attachmentId))
      .get()
  )
    throw new DomainError('validation', 'The attachment is still referenced.');
  if (
    !tx.select().from(attachments).where(eq(attachments.id, attachmentId)).get()
  )
    throw new DomainError('not-found', 'Attachment not found.');
  const existing = tx
    .select()
    .from(fileCleanupJobs)
    .where(eq(fileCleanupJobs.attachmentId, attachmentId))
    .get();
  if (existing) return existing.id;
  const id = newPrivateId();
  const now = Date.now();
  tx.insert(fileCleanupJobs)
    .values({
      id,
      attachmentId,
      state: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}
