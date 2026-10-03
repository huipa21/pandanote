import { z } from 'zod';

// Preserve the exact password: no trim, case folding or Unicode normalization.
export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => new TextEncoder().encode(value).length <= 1024);
export const passwordSchema = loginPasswordSchema.refine(
  (value) => [...value].length >= 12,
  'Use at least 12 characters (up to 256).',
);
export const authTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const setupRequestSchema = z.strictObject({
  token: authTokenSchema,
  password: passwordSchema,
});
export const loginRequestSchema = z.strictObject({
  password: loginPasswordSchema,
});
