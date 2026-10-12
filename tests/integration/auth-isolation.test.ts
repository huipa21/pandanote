import { generateSync } from 'otplib';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { AuthRateLimiter } from '../../src/lib/server/auth/rate-limits.ts';
import { DeviceTrust } from '../../src/lib/server/auth/device-trust.ts';
import { newAuthToken } from '../../src/lib/server/auth/tokens.ts';
import { account } from '../../src/lib/server/db/schema.ts';

const password = 'synthetic-isolation-only password';
const epoch = 1_800_000_000_000;
const addresses = [
  { name: 'shared IPv4', attacker: '192.0.2.70', owner: '192.0.2.70' },
  {
    name: 'shared IPv6 /64',
    attacker: '2001:db8:1:2::a',
    owner: '2001:db8:1:2::b',
  },
  { name: 'mapped IPv4', attacker: '::ffff:192.0.2.70', owner: '192.0.2.70' },
];

it.each(addresses)(
  'SEC-LOCK-8: $name anonymous password floods cannot spend a trusted device/IP allowance',
  async ({ attacker, owner }) => {
    await withPersistence(async (p) => {
      let now = epoch;
      const auth = new AuthService(p, () => now);
      const first = await createFixtureAccount(auth, password, owner);
      const second = await auth.login('fixture', password, '203.0.113.1');
      if (second.mfaRequired) throw new Error('unexpected MFA');
      const device = first.device!.token;
      const deviceId = device.split('.')[1];
      const limiter = new AuthRateLimiter(p);
      for (let i = 0; i < 10; i++)
        await expect(
          auth.login('fixture', 'incorrect password', attacker),
        ).rejects.toMatchObject({ code: 'unauthorized' });
      const row = p.db.select().from(account).get()!;
      const expired = new DeviceTrust(
        p.storage.readKeys().totpEncryptionKey,
      ).issue(row.id, row.securityRevision, now - 181 * 86_400_000).token;
      for (const token of [
        undefined,
        'v1.junk',
        device.replace(/[^.]+$/, 'A'.repeat(43)),
        expired,
      ])
        await expect(
          auth.login('fixture', password, owner, token),
        ).rejects.toMatchObject({ code: 'rate-limited' });
      // A marker never substitutes for the password. Both failures and successes count.
      await expect(
        auth.login('fixture', 'incorrect password', owner, device),
      ).rejects.toMatchObject({ code: 'unauthorized' });
      const ok = await auth.login('fixture', password, owner, device);
      if (ok.mfaRequired) throw new Error('unexpected MFA');
      expect(auth.authenticate(ok.token)).not.toBeNull();
      expect(ok.device!.token.split('.')[1]).toBe(deviceId);
      for (let i = 0; i < 8; i++)
        limiter.attempt('login', owner, now, deviceId);
      await expect(
        auth.login('fixture', password, owner, device),
      ).rejects.toMatchObject({ code: 'rate-limited' });
      // Another real signed-in browser at the same IP has its own allowance.
      await expect(
        auth.login('fixture', password, owner, second.device!.token),
      ).resolves.toBeDefined();
      // Rotating IPs still cannot exceed the device-wide 30-attempt cap.
      for (let i = 0; i < 20; i++)
        limiter.attempt('login', `198.51.100.${i + 1}`, now, deviceId);
      await expect(
        auth.login('fixture', password, '203.0.113.2', device),
      ).rejects.toMatchObject({ code: 'rate-limited' });
      now += 15 * 60_000;
      await expect(
        auth.login('fixture', password, owner, device),
      ).resolves.toBeDefined();
    });
  },
  30_000,
);

it.each(addresses)(
  'SEC-LOCK-9: $name anonymous password/MFA floods cannot spend a trusted MFA allowance',
  async ({ attacker, owner }) => {
    await withPersistence(async (p) => {
      let now = epoch;
      const auth = new AuthService(p, () => now);
      const first = await createFixtureAccount(auth, password, owner);
      const identity = auth.authenticate(first.token)!;
      const fresh = await auth.freshAuth(
        identity,
        'mfa-enroll',
        password,
        undefined,
        owner,
      );
      const enrollment = auth.startEnrollment(identity, fresh.token);
      const enabled = auth.confirmEnrollment(
        identity,
        enrollment.challenge,
        generateSync({ secret: enrollment.secret, epoch: now / 1000 }),
        owner,
        first.device!.token,
      );
      now += 30_000;
      const device = enabled.credential.device!.token;
      for (let i = 0; i < 10; i++) {
        expect(() =>
          auth.completeMfa(newAuthToken(), 'not-a-code', attacker),
        ).toThrow(/Enter your password again/);
        await expect(
          auth.login('fixture', 'incorrect password', attacker),
        ).rejects.toMatchObject({ code: 'unauthorized' });
      }
      const pending = await auth.login('fixture', password, owner, device);
      expect(pending.mfaRequired).toBe(true);
      expect(auth.authenticate(pending.token)).toBeNull();
      for (const token of [undefined, device.replace(/[^.]+$/, 'A'.repeat(43))])
        expect(() =>
          auth.completeMfa(pending.token, enabled.codes[0], owner, token),
        ).toThrow(/Too many attempts/);
      expect(() =>
        auth.completeMfa(pending.token, 'not-a-code', owner, device),
      ).toThrow(/Invalid username or password/);
      const ok = auth.completeMfa(
        pending.token,
        enabled.codes[0],
        owner,
        device,
      );
      expect(auth.authenticate(ok.token)).not.toBeNull();
      expect(ok.device!.token.split('.')[1]).toBe(device.split('.')[1]);
      const limiter = new AuthRateLimiter(p);
      for (let i = 0; i < 8; i++)
        limiter.attempt('mfa', owner, now, device.split('.')[1]);
      const next = await auth.login('fixture', password, owner, device);
      expect(() =>
        auth.completeMfa(next.token, enabled.codes[1], owner, device),
      ).toThrow(/Too many attempts/);
    });
  },
  30_000,
);

it.each(addresses)(
  'SEC-SETUP-14: $name wrong-code floods cannot spend the correct setup code/IP allowance',
  async ({ attacker, owner }) => {
    await withPersistence(async (p) => {
      const auth = new AuthService(p, () => epoch);
      const code = auth.setupCode()!;
      const bare = code.replaceAll('-', '');
      const wrong = (bare[0] === 'A' ? 'B' : 'A') + bare.slice(1);
      const details = {
        username: 'fixture',
        email: 'fixture@example.invalid',
        password,
        passwordConfirm: password,
      };
      for (let i = 0; i < 10; i++)
        await expect(
          auth.createAccount({ ...details, setupCode: wrong }, attacker),
        ).rejects.toThrow(/Setup code is incorrect/);
      await expect(
        auth.createAccount({ ...details, setupCode: wrong }, owner),
      ).rejects.toMatchObject({ code: 'rate-limited' });
      const credential = await auth.createAccount(
        { ...details, setupCode: code },
        owner,
      );
      expect(auth.authenticate(credential.token)).not.toBeNull();
    });
  },
);

it('SEC-SETUP-15: correct-code requests retain their own IP and aggregate caps, fixed expiry and validation', async () => {
  await withPersistence(async (p) => {
    let now = epoch;
    const auth = new AuthService(p, () => now);
    const details = {
      setupCode: auth.setupCode()!,
      username: '!',
      email: 'fixture@example.invalid',
      password,
      passwordConfirm: password,
    };
    for (let i = 0; i < 10; i++)
      await expect(auth.createAccount(details, '192.0.2.70')).rejects.toThrow();
    await expect(
      auth.createAccount({ ...details, username: 'fixture' }, '192.0.2.70'),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    for (let i = 0; i < 20; i++)
      await expect(
        auth.createAccount(details, `198.51.100.${i + 1}`),
      ).rejects.toThrow();
    await expect(
      auth.createAccount({ ...details, username: 'fixture' }, '203.0.113.1'),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    expect(p.db.select().from(account).all()).toEqual([]);
    now += 15 * 60_000;
    await auth.createAccount({ ...details, username: 'fixture' }, '192.0.2.70');
  });
});
