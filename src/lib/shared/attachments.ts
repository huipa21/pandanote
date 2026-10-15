import { z } from 'zod';
import { digestSchema, idSchema, mutationIdentitySchema } from './domain.ts';

export const filenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (v) => new TextDecoder().decode(new TextEncoder().encode(v)) === v,
    'Filename must be valid Unicode',
  )
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), 'Invalid filename');
/** Rename a saved voice clip. The bytes, digest and MIME never change. */
export const renameAttachmentSchema = z.strictObject({
  filename: filenameSchema.refine(
    (v) => !/[/\\:*?"<>|]/.test(v) && v.trim() === v && !v.startsWith('.'),
    'Invalid filename',
  ),
});
// Frozen input identity, not client-supplied filesystem paths or trusted MIME.
export const uploadItemSchema = z.strictObject({
  id: idSchema,
  filename: filenameSchema,
  incomingBytes: z
    .number()
    .int()
    .min(0)
    .max(500 * 1024 * 1024),
  incomingDigest: digestSchema,
  /** Voice clip: the bytes must be a recognised audio container and are then
   * stored as `audio/*`. Without it audio containers stay opaque downloads. */
  voice: z.boolean().optional(),
});
/** Provisional `detectedMime` of a pending voice item. The flag is persisted in
 * this existing column (no schema change); it is replaced by the detected
 * container MIME when the upload becomes ready. */
export const VOICE_PENDING_MIME = 'audio/x-voice-pending';
export const VOICE_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const;
export const isVoiceMime = (mime: string): boolean =>
  (VOICE_MIMES as readonly string[]).includes(mime);
/** A stored voice clip: a `file` attachment whose detected MIME is an audio container. */
export const isVoiceClip = (file: { kind: string; mime: string }): boolean =>
  file.kind === 'file' && isVoiceMime(file.mime);
export const initializeBatchSchema = mutationIdentitySchema
  .extend({
    items: z.array(uploadItemSchema).max(100),
  })
  .refine(
    (v) => new Set(v.items.map((item) => item.id)).size === v.items.length,
    'Duplicate attachment IDs',
  );
export type UploadItem = z.infer<typeof uploadItemSchema>;
export type InitializeBatch = z.infer<typeof initializeBatchSchema>;
export interface ReadyAttachment {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  mime: string;
  incomingBytes: number;
  readiness: 'pending' | 'ready' | 'failed';
  storedBytes: number;
  width: number | null;
  height: number | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}
export interface UploadBatchDto {
  id: string;
  status: 'pending' | 'committed' | 'abandoned';
  attachments: ReadyAttachment[];
}
export type InitializeBatchResult =
  | { state: 'batch'; batch: UploadBatchDto }
  | { state: 'confirmed'; result: import('./domain.ts').MutationResult };
