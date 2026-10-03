import { expect, it } from 'vitest';
import {
  acceptedStep,
  normalizeRecoveryCode,
} from '../../src/lib/server/auth/factors.ts';
import {
  freshAuthRequestSchema,
  securityRequestSchema,
} from '../../src/lib/shared/auth.ts';

// RFC 6238 SHA-1 seed and six-digit suffixes of its eight-digit test vectors.
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
it('uses seconds at the otplib boundary and matches RFC 6238 steps with bounded drift', () => {
  expect(acceptedStep(secret, '287082', 59_000, null)).toBe(1);
  expect(acceptedStep(secret, '081804', 1_111_111_109_000, null)).toBe(
    37_037_036,
  );
  expect(acceptedStep(secret, '287082', 89_000, null)).toBe(1);
  expect(acceptedStep(secret, '287082', 119_000, null)).toBeNull();
  expect(acceptedStep(secret, '287082', 59_000, 1)).toBeNull();
  expect(acceptedStep(secret, '287082', 59_000, 100)).toBeNull();
  expect(acceptedStep(secret, '12345', 59_000, null)).toBeNull();
});
it('normalizes only recovery code formatting, and rejects unscoped/extra/invalid security inputs', () => {
  expect(normalizeRecoveryCode(' AABBCCDD-eeff0011-22334455-66778899 ')).toBe(
    'aabbccddeeff00112233445566778899',
  );
  expect(
    freshAuthRequestSchema.safeParse({
      scope: 'everything',
      password: 'synthetic',
    }).success,
  ).toBe(false);
  expect(
    freshAuthRequestSchema.safeParse({
      scope: 'restore',
      password: 'synthetic',
      admin: true,
    }).success,
  ).toBe(false);
  expect(
    securityRequestSchema.safeParse({
      action: 'lifetime',
      grant: 'a'.repeat(43),
      days: 0,
    }).success,
  ).toBe(false);
  expect(securityRequestSchema.safeParse({ action: 'disable' }).success).toBe(
    false,
  );
  expect(
    securityRequestSchema.safeParse({
      action: 'password',
      grant: 'a'.repeat(43),
      password: 'short',
    }).success,
  ).toBe(false);
});
