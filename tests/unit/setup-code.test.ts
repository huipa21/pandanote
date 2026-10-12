import { expect, it } from 'vitest';
import { setupCodeSchema } from '../../src/lib/shared/auth.ts';
import {
  formatSetupCode,
  newSetupCode,
  setupCodeDigest,
  setupCodeMatches,
} from '../../src/lib/server/auth/setup-code.ts';

const code = 'ABCDE-FGHJK-MNPQR-STUVW';

it('generates 20 symbols from the 31-symbol alphabet in four groups of five', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const value = newSetupCode();
    expect(value).toMatch(
      /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}(-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}){3}$/,
    );
    seen.add(value);
  }
  expect(seen.size).toBe(200);
  expect(formatSetupCode('ABCDEFGHJKMNPQRSTUVW')).toBe(code);
});

it('accepts lowercase, spaces and hyphens and normalizes to the canonical 20 symbols', () => {
  expect(setupCodeSchema.parse(' abcde fghjk-mnpqr  stuvw ')).toBe(
    'ABCDEFGHJKMNPQRSTUVW',
  );
  expect(setupCodeSchema.parse(code)).toBe('ABCDEFGHJKMNPQRSTUVW');
  for (const value of [
    '',
    'ABCDEFGHJKMNPQRSTUV',
    'ABCDEFGHJKMNPQRSTUVWX',
    'ABCDEFGHJKMNPQRSTU0',
    'ABCDEFGHJKMNPQRSTU1',
    'ABCDEFGHJKMNPQRSTUI',
    'ABCDEFGHJKMNPQRSTUL',
    'ABCDEFGHJKMNPQRSTUO',
    'ABCDEFGHJKMNPQRSTU!',
    'a'.repeat(101),
  ])
    expect(setupCodeSchema.safeParse(value).success).toBe(false);
});

it('compares digests in constant time and fails closed without a generated code', () => {
  const digest = setupCodeDigest(code);
  expect(setupCodeMatches(digest, code)).toBe(true);
  expect(setupCodeMatches(digest, 'abcde-fghjk-mnpqr-stuvw')).toBe(true);
  expect(setupCodeMatches(digest, 'ABCDE-FGHJK-MNPQR-STUVX')).toBe(false);
  expect(setupCodeMatches(digest, undefined)).toBe(false);
  expect(setupCodeMatches(digest, 42)).toBe(false);
  expect(setupCodeMatches(undefined, code)).toBe(false);
});
