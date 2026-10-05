import { z } from 'zod';
import { settingsSchema } from './settings.ts';
import { idSchema, instantSchema } from './domain.ts';

export const storageLimitsSchema = settingsSchema.pick({
  imageInputMaxBytes: true,
  fileMaxBytes: true,
  imageMaxPixels: true,
  displayMaxEdge: true,
  displayQuality: true,
  thumbnailMaxEdge: true,
  thumbnailQuality: true,
  markdownMaxBytes: true,
  maxAttachmentsPerNote: true,
});
export type StorageLimits = z.infer<typeof storageLimitsSchema>;
export function storageLimitsFrom(settings: unknown): StorageLimits {
  return storageLimitsSchema.parse(
    Object.fromEntries(
      Object.keys(storageLimitsSchema.shape).map((key) => [
        key,
        (settings as Record<string, unknown>)[key],
      ]),
    ),
  );
}
export const STORAGE_FIELDS: ReadonlyArray<{
  key: keyof StorageLimits;
  label: string;
  scale: number;
  min: number;
  max: number;
  step: number;
}> = [
  {
    key: 'imageInputMaxBytes',
    label: 'Image input limit (MiB)',
    scale: 1024 ** 2,
    min: 1 / 1024,
    max: 100,
    step: 1 / 1024,
  },
  {
    key: 'fileMaxBytes',
    label: 'Other file limit (MiB)',
    scale: 1024 ** 2,
    min: 1 / 1024,
    max: 500,
    step: 1 / 1024,
  },
  {
    key: 'imageMaxPixels',
    label: 'Decoded image limit (megapixels)',
    scale: 1_000_000,
    min: 0.000001,
    max: 50,
    step: 0.000001,
  },
  {
    key: 'displayMaxEdge',
    label: 'Display image maximum edge (px)',
    scale: 1,
    min: 1,
    max: 4096,
    step: 1,
  },
  {
    key: 'displayQuality',
    label: 'Display WebP quality',
    scale: 1,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: 'thumbnailMaxEdge',
    label: 'Thumbnail maximum edge (px)',
    scale: 1,
    min: 1,
    max: 1024,
    step: 1,
  },
  {
    key: 'thumbnailQuality',
    label: 'Thumbnail WebP quality',
    scale: 1,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: 'markdownMaxBytes',
    label: 'Note Markdown limit (KiB)',
    scale: 1024,
    min: 1 / 1024,
    max: 1024,
    step: 1 / 1024,
  },
  {
    key: 'maxAttachmentsPerNote',
    label: 'Attachments per note',
    scale: 1,
    min: 1,
    max: 100,
    step: 1,
  },
];
// A server-observed quiet interval, not automatic expiry. Nothing is deleted on a timer.
export const UNUSED_UPLOAD_QUIET_MS = 24 * 60 * 60 * 1000;
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const pendingUploadSchema = z.strictObject({
  id: idSchema,
  activityAt: instantSchema,
  eligibleAt: instantSchema,
  eligible: z.boolean(),
  readyCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  storedBytes: bytes,
  filenames: z.array(z.string().max(255)).max(5),
});
export type PendingUpload = z.infer<typeof pendingUploadSchema>;
export const storageUsageSchema = z.strictObject({
  measuredAt: instantSchema,
  totalDiskBytes: bytes,
  freeDiskBytes: bytes,
  reserveBytes: bytes,
  availableAboveReserveBytes: bytes,
  referencedBytes: bytes,
  trashOnlyBytes: bytes,
  unusedBytes: bytes,
  backupBytes: bytes,
  databaseBytes: bytes,
  stagingBytes: bytes,
  cleanupJobs: z.number().int().nonnegative(),
  pendingBatchCount: z.number().int().nonnegative(),
  pendingUploads: z.array(pendingUploadSchema).max(20),
});
export type StorageUsage = z.infer<typeof storageUsageSchema>;
export const retryCleanupSchema = z.strictObject({
  confirmed: z.literal(true),
  retryQueued: z.literal(true),
});
export const cleanupUploadsSchema = z.strictObject({
  confirmed: z.literal(true),
  batches: z
    .array(z.strictObject({ id: idSchema, activityAt: instantSchema }))
    .min(1)
    .max(20)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
    ),
});
