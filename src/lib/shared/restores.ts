import { z } from 'zod';
import { backupCommandSchema } from './backups.ts';
import { idSchema } from './domain.ts';
export const restoreConfirmSchema = backupCommandSchema.extend({
  id: idSchema,
  confirmed: z.literal(true),
});
export interface RestoreSummary {
  id: string;
  createdAt: number;
  schemaVersion: number;
  bytes: number;
  notes: number;
  published: number;
  trash: number;
  attachments: number;
  mfaEnabled: boolean;
}
