import { dirname } from 'node:path';
import { rm } from 'node:fs/promises';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import { attachments, fileCleanupJobs, noteAttachments } from '../db/schema.ts';
import { rejectSymlinks, syncDirectory } from '../storage/private-storage.ts';

/** Crash-recoverable worker for transactionally queued IDs only. Exclusive drain
 * prevents concurrent posting from installing outputs during byte deletion.
 * Queued-file triggers prohibit new note references, including Trash/clone refs. */
export async function runAttachmentCleanup(p: Persistence): Promise<void> {
  if (
    !p.db
      .select({ id: fileCleanupJobs.id })
      .from(fileCleanupJobs)
      .limit(1)
      .get()
  )
    return;
  await p.coordinator.exclusive(async (lease) => {
    let after: string | undefined;
    while (true) {
      const jobs = p.db
        .select()
        .from(fileCleanupJobs)
        .where(after ? gt(fileCleanupJobs.id, after) : undefined)
        .orderBy(asc(fileCleanupJobs.id))
        .limit(100)
        .all();
      if (jobs.length === 0) break;
      for (const job of jobs) {
        after = job.id;
        if (
          p.db
            .select()
            .from(noteAttachments)
            .where(eq(noteAttachments.attachmentId, job.attachmentId))
            .get()
        ) {
          // A violated invariant must not turn into lost bytes.
          p.write(
            (tx) =>
              tx
                .update(fileCleanupJobs)
                .set({
                  state: 'failed',
                  errorCode: 'referenced',
                  updatedAt: Date.now(),
                })
                .where(eq(fileCleanupJobs.id, job.id))
                .run(),
            lease,
          );
          continue;
        }
        p.write(
          (tx) =>
            tx
              .update(fileCleanupJobs)
              .set({
                state: 'running',
                attempts: job.attempts + 1,
                errorCode: null,
                updatedAt: Date.now(),
              })
              .where(eq(fileCleanupJobs.id, job.id))
              .run(),
          lease,
        );
        try {
          const folder = dirname(
            p.storage.attachmentPath(job.attachmentId, 'attachment.bin'),
          );
          rejectSymlinks(folder);
          await rm(folder, { recursive: true, force: true });
          syncDirectory(dirname(folder));
          p.write((tx) => {
            // Recheck inside the metadata transaction; deleting bytes alone never
            // discards the durable job. Crash here repeats a safe missing-dir delete.
            if (
              tx
                .select()
                .from(noteAttachments)
                .where(eq(noteAttachments.attachmentId, job.attachmentId))
                .get()
            )
              throw new Error('Attachment gained a reference');
            tx.delete(fileCleanupJobs)
              .where(
                and(
                  eq(fileCleanupJobs.id, job.id),
                  eq(fileCleanupJobs.attachmentId, job.attachmentId),
                ),
              )
              .run();
            tx.delete(attachments)
              .where(eq(attachments.id, job.attachmentId))
              .run();
          }, lease);
        } catch {
          p.write(
            (tx) =>
              tx
                .update(fileCleanupJobs)
                .set({
                  state: 'failed',
                  errorCode: 'delete-failed',
                  updatedAt: Date.now(),
                })
                .where(eq(fileCleanupJobs.id, job.id))
                .run(),
            lease,
          );
        }
      }
    }
  });
}
