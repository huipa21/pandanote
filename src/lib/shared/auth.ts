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
export const freshAuthScopeSchema = z.enum([
  'password-change',
  'mfa-enroll',
  'mfa-disable',
  'recovery-regenerate',
  'sessions-revoke',
  'session-lifetime',
  'backup-create',
  'backup-download',
  'backup-delete',
  'restore',
]);
export type FreshAuthScope = z.infer<typeof freshAuthScopeSchema>;
export const factorSchema = z.string().min(1).max(80);
export const mfaRequestSchema = z.strictObject({
  challenge: authTokenSchema,
  code: factorSchema,
});
export const freshAuthRequestSchema = z.strictObject({
  scope: freshAuthScopeSchema,
  password: loginPasswordSchema,
  code: factorSchema.optional(),
});
export const securityRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('enroll'), grant: authTokenSchema }),
  z.strictObject({
    action: z.literal('confirm'),
    challenge: authTokenSchema,
    code: factorSchema,
  }),
  z.strictObject({ action: z.literal('cancel-enrollment') }),
  z.strictObject({ action: z.literal('disable'), grant: authTokenSchema }),
  z.strictObject({ action: z.literal('regenerate'), grant: authTokenSchema }),
  z.strictObject({
    action: z.literal('password'),
    grant: authTokenSchema,
    password: passwordSchema,
  }),
  z.strictObject({ action: z.literal('revoke'), grant: authTokenSchema }),
  z.strictObject({
    action: z.literal('lifetime'),
    grant: authTokenSchema,
    days: z.number().int().min(1).max(30),
  }),
]);
