import { z } from 'zod';
import { settingsSchema } from './settings.ts';

// Preserve the exact password: no trim, case folding or Unicode normalization.
export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => [...value].length <= 128, 'Use at most 128 characters.')
  .refine((value) => new TextEncoder().encode(value).length <= 1024);
export const passwordSchema = loginPasswordSchema.refine(
  (value) => [...value].length >= 8,
  'Use 8–128 characters.',
);
export const authTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,32}$/,
    'Use 3–32 characters: a–z, 0–9, dot, underscore or hyphen.',
  );
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .regex(
    /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/,
    'Enter an email address with a dotted domain.',
  );
export const accountDetailsSchema = z.strictObject({
  username: usernameSchema,
  email: emailSchema,
});
export const setupAccountSchema = z
  .strictObject({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: passwordSchema,
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passwords must match exactly.',
  });
export const setupPreferencesSchema = settingsSchema.pick({
  siteTitle: true,
  language: true,
  timezone: true,
});
export const accountUpdateSchema = accountDetailsSchema.extend({
  grant: authTokenSchema,
});
export const loginRequestSchema = z.strictObject({
  username: z.string().max(256),
  password: loginPasswordSchema,
});
export const freshAuthScopeSchema = z.enum([
  'password-change',
  'account-update',
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
