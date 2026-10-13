import { tr } from '#lib/client/i18n-current.ts';
import { z } from 'zod';
import {
  idSchema,
  digestSchema,
  mutationResultSchema,
} from '#lib/shared/domain.ts';
import { initializeBatchSchema } from '#lib/shared/attachments.ts';
import {
  canonicalNoteMutation,
  noteMutationSchema,
  type NoteMutation,
} from '#lib/shared/notes.ts';

export const postingAttemptSchema = z
  .strictObject({
    command: noteMutationSchema.refine((command) => 'content' in command),
    manifest: initializeBatchSchema,
    phase: z.enum(['frozen', 'uploading', 'committing', 'confirmed']),
    batchId: idSchema.nullable(),
    readyIds: z.array(idSchema).max(100),
    result: mutationResultSchema.nullable(),
  })
  .refine(
    (attempt) =>
      attempt.command.mutationId === attempt.manifest.mutationId &&
      attempt.manifest.items.every(
        (item) =>
          'content' in attempt.command &&
          attempt.command.content.attachmentIds.includes(item.id),
      ) &&
      attempt.readyIds.every((id) =>
        attempt.manifest.items.some((item) => item.id === id),
      ) &&
      (attempt.phase === 'confirmed') === (attempt.result !== null),
    tr('attempt.invalid'),
  );
export type PostingAttempt = z.infer<typeof postingAttemptSchema>;
export async function sha256(value: string | Blob): Promise<string> {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : await value.arrayBuffer();
  return digestSchema.parse(
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join(''),
  );
}
export const commandDigest = (command: NoteMutation) =>
  sha256(canonicalNoteMutation(command));
