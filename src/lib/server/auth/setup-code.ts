import { randomInt, timingSafeEqual } from 'node:crypto';
import { normalizeSetupCode } from '../../shared/auth.ts';
import { tokenHash } from './tokens.ts';

// Setup code (security-hardening SH2). Server-only. The plaintext lives only in the
// AuthService instance and in the one startup log line; SQLite and files never see it.
export const SETUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SETUP_CODE_LENGTH = 20;
// Correct codes are counted in their own per-key bucket (not the account-wide one),
// so a flood of wrong codes cannot exhaust the owner's setup allowance.
export const SETUP_CODE_BUCKET = 'setup-code';
export const SETUP_CODE_MESSAGE =
  'Setup code is incorrect. Use the newest code from the server log.';

/** Wrong, missing or malformed setup codes. Carries no code value. */
export class SetupCodeError extends Error {
  readonly field = 'setupCode';
  constructor() {
    super(SETUP_CODE_MESSAGE);
    this.name = 'SetupCodeError';
  }
}

export function formatSetupCode(normalized: string): string {
  return normalized.match(/.{5}/g)!.join('-');
}

// Returns the display form XXXXX-XXXXX-XXXXX-XXXXX.
export function newSetupCode(): string {
  let raw = '';
  for (let i = 0; i < SETUP_CODE_LENGTH; i++)
    raw += SETUP_ALPHABET[randomInt(SETUP_ALPHABET.length)];
  return formatSetupCode(raw);
}

export function setupCodeDigest(code: string): string {
  return tokenHash('setup', normalizeSetupCode(code));
}

// Constant-time comparison of digests. Missing digest (no code generated for this
// instance) fails closed.
export function setupCodeMatches(
  digest: string | undefined,
  input: unknown,
): boolean {
  if (!digest || typeof input !== 'string') return false;
  const actual = Buffer.from(setupCodeDigest(input), 'hex');
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
