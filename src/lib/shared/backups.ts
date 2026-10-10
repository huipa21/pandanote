import { z } from 'zod';
import { idSchema, instantSchema } from './domain.ts';

export const BACKUP_FORMAT = 2;
export const PRE_RELEASE_BACKUP_MESSAGE =
  'This backup was created by a pre-release PandaNote and cannot be restored. Start with an empty instance and create a new backup.';
export const BACKUP_MAX_ENTRIES = 100_000;
export const BACKUP_MANIFEST_BYTES = 16 * 1024 ** 2;
export const BACKUP_MAX_BYTES = 64 * 1024 ** 3;
export const backupEntrySchema = z.strictObject({
  path: z
    .string()
    .regex(
      /^(snapshot\/(pandanote\.sqlite|key-material\.json)|files\/[0-9a-f-]{36}\/(display\.webp|thumbnail\.webp|attachment\.bin))$/,
    ),
  size: z
    .number()
    .int()
    .min(0)
    .max(8 * 1024 ** 3 - 1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const backupManifestSchema = z
  .strictObject({
    format: z.literal('PandaNote'),
    formatVersion: z.literal(BACKUP_FORMAT),
    schemaVersion: z.number().int().positive(),
    appVersion: z.string().max(64),
    createdAt: instantSchema,
    counts: z.strictObject({
      notes: z.number().int().nonnegative(),
      attachments: z.number().int().nonnegative(),
    }),
    included: z.literal(
      'notes,trash,tags,receipts,files,settings,account,mfa,recovery-codes,portable-keys',
    ),
    excluded: z.literal(
      'unsaved-editors,sessions,challenges,rate-limits,pending-uploads,cleanup-jobs,search,backup-catalog,archives,staging,pre-upgrade,deployment',
    ),
    entries: z
      .array(backupEntrySchema)
      .min(2)
      .max(BACKUP_MAX_ENTRIES - 1),
  })
  .superRefine((value, ctx) => {
    const names = value.entries.map((entry) => entry.path);
    if (
      new Set(names).size !== names.length ||
      !names.includes('snapshot/pandanote.sqlite') ||
      !names.includes('snapshot/key-material.json') ||
      value.entries.reduce((sum, entry) => sum + entry.size, 0) >
        BACKUP_MAX_BYTES
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid backup payload inventory.',
      });
  });
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export type BackupEntry = z.infer<typeof backupEntrySchema>;
export const backupCommandSchema = z.strictObject({
  grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const backupCreateSchema = backupCommandSchema.extend({ id: idSchema });
export const backupDeleteSchema = backupCommandSchema.extend({
  confirmed: z.literal(true),
});
export interface BackupJob {
  id: string;
  state: 'pending' | 'capturing' | 'archiving' | 'complete' | 'failed';
  bytes: number | null;
  progress: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}
