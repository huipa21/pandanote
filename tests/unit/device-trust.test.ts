import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  DEVICE_LIFETIME_MS,
  DeviceTrust,
} from '../../src/lib/server/auth/device-trust.ts';

const now = 1_800_000_000_000;
const key = randomBytes(32).toString('base64');
const owner = { id: 'a'.repeat(32), securityRevision: 3 };

it('verifies only unexpired, untampered tokens bound to the account and revision', () => {
  const trust = new DeviceTrust(key);
  const { token, expiresAt } = trust.issue(owner.id, 3, now);
  expect(expiresAt).toBe(now + DEVICE_LIFETIME_MS);
  const id = trust.verify(token, owner, now);
  expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  // Reissue keeps the device id.
  expect(
    trust.verify(trust.issue(owner.id, 3, now, id!).token, owner, now),
  ).toBe(id);
  expect(trust.verify(token, owner, expiresAt)).toBeNull(); // expired
  expect(
    trust.verify(token, { ...owner, securityRevision: 4 }, now),
  ).toBeNull(); // password/MFA change
  expect(trust.verify(token, { ...owner, id: 'b'.repeat(32) }, now)).toBeNull();
  expect(trust.verify(token, undefined, now)).toBeNull();
  expect(
    new DeviceTrust(randomBytes(32).toString('base64')).verify(
      token,
      owner,
      now,
    ),
  ).toBeNull();
  const parts = token.split('.');
  for (const bad of [
    undefined,
    '',
    'v1.junk',
    `${token}.x`,
    token.replace('.3.', '.2.'),
    [parts[0], parts[1], parts[2] + '0', parts[3], parts[4]].join('.'),
    token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'),
    'x'.repeat(500),
  ])
    expect(trust.verify(bad, owner, now)).toBeNull();
});
