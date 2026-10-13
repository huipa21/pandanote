import { z } from 'zod';
import { idSchema } from './domain.ts';
export const restoreConfirmSchema = z.strictObject({
  grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
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
