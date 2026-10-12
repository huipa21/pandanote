import { generateSync } from 'otplib';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import {
  account,
  authChallenges,
  recoveryCodes,
  sessions,
} from '../../src/lib/server/db/schema.ts';
import {
  decryptSecret,
  encryptSecret,
} from '../../src/lib/server/auth/factors.ts';
import { newAuthToken, tokenHash } from '../../src/lib/server/auth/tokens.ts';
import {
  AuthRateLimiter,
  DAILY_MFA_FAILURES,
  FAILURES_SINCE_SUCCESS,
  FAILURES_SINCE_SUCCESS_WINDOW_MS,
  MFA_DAILY_FAILURES,
  RateLimitError,
} from '../../src/lib/server/auth/rate-limits.ts';
import { authErrorResponse } from '../../src/lib/server/auth/http.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';
import type { FreshAuthScope } from '../../src/lib/shared/auth.ts';
const password = 'synthetic-mfa-only 密碼 password';
const replacement = 'synthetic-new-only 密碼 password';
const ip = '192.0.2.42';
const epoch = 1_800_000_000_000;
const otp = (secret: string, time: number) =>
  generateSync({ secret, epoch: time / 1000 });
async function fixture(p: Persistence) {
  let time = epoch;
  const auth = new AuthService(p, () => time);
  const initial = await createFixtureAccount(auth, password, ip);
  let identity = auth.authenticate(initial.token)!;
  const grant = await auth.freshAuth(
    identity,
    'mfa-enroll',
    password,
    undefined,
    ip,
  );
  const enrollment = auth.startEnrollment(identity, grant.token);
  const enable = () => {
    const result = auth.confirmEnrollment(
      identity,
      enrollment.challenge,
      otp(enrollment.secret, time),
      ip,
    );
    identity = auth.authenticate(result.credential.token)!;
    time += 30_000;
    return result;
  };
  return {
    auth,
    enrollment,
    initial,
    enable,
    get identity() {
      return identity;
    },
    get time() {
      return time;
    },
    advance(ms = 30_000) {
      time += ms;
    },
    async grant(scope: FreshAuthScope, code = otp(enrollment.secret, time)) {
      const grant = await auth.freshAuth(identity, scope, password, code, ip);
      time += 30_000;
      return grant.token;
    },
  };
}

it('encrypts enrollment/active secrets with random AES-GCM nonces, bound AAD, local QR and confirmation-only activation', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    expect(f.auth.securityStatus(f.identity).mfaEnabled).toBe(false);
    expect(f.enrollment.qr.length).toBeGreaterThan(20);
    expect(f.enrollment.uri).toContain('otpauth://totp/');
    const pending = p.db.select().from(authChallenges).get()!;
    expect(JSON.stringify(pending)).not.toContain(f.enrollment.secret);
    expect(() =>
      f.auth.confirmEnrollment(
        f.identity,
        f.enrollment.challenge,
        'not-a-code',
        ip,
      ),
    ).toThrow();
    expect(f.auth.securityStatus(f.identity).mfaEnabled).toBe(false);
    const enabled = f.enable();
    expect(enabled.codes).toHaveLength(10);
    expect(new Set(enabled.codes).size).toBe(10);
    expect(f.auth.authenticate(f.initial.token)).toBeNull();
    const stored = p.db.select().from(account).get()!;
    const keys = p.storage.readKeys();
    expect(
      decryptSecret(keys, stored.totpSecretEncrypted!, `account:${stored.id}`),
    ).toBe(f.enrollment.secret);
    expect(() =>
      decryptSecret(keys, stored.totpSecretEncrypted!, 'wrong-context'),
    ).toThrow();
    const parts = stored.totpSecretEncrypted!.split('.');
    parts[4] = Buffer.alloc(16).toString('base64url');
    expect(() =>
      decryptSecret(keys, parts.join('.'), `account:${stored.id}`),
    ).toThrow();
    expect(
      encryptSecret(keys, f.enrollment.secret, `account:${stored.id}`),
    ).not.toBe(stored.totpSecretEncrypted);
    const dump =
      JSON.stringify(p.db.select().from(account).all()) +
      JSON.stringify(p.db.select().from(recoveryCodes).all()) +
      JSON.stringify(p.db.select().from(authChallenges).all());
    for (const secret of [
      f.enrollment.secret,
      f.enrollment.challenge,
      password,
      ...enabled.codes,
    ])
      expect(dump).not.toContain(secret);
    expect(Object.keys(f.auth.securityStatus(f.identity)).sort()).toEqual([
      'failedSecondFactorAttempts',
      'mfaEnabled',
      'recoveryCodesRemaining',
      'sessionLifetimeDays',
    ]);
  });
});
it('expired, canceled and replaced enrollments fail, and another session cannot confirm', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const other = f.auth.authenticate(
      (await f.auth.login('fixture', password, ip)).token,
    )!;
    expect(() =>
      f.auth.confirmEnrollment(
        other,
        f.enrollment.challenge,
        otp(f.enrollment.secret, f.time),
        ip,
      ),
    ).toThrow();
    f.advance(5 * 60_000);
    expect(() =>
      f.auth.confirmEnrollment(
        f.identity,
        f.enrollment.challenge,
        otp(f.enrollment.secret, f.time),
        ip,
      ),
    ).toThrow();
    const one = f.auth.startEnrollment(
      f.identity,
      await f.grant('mfa-enroll', 'unused'),
    );
    const two = f.auth.startEnrollment(
      f.identity,
      await f.grant('mfa-enroll', 'unused'),
    );
    expect(() =>
      f.auth.confirmEnrollment(
        f.identity,
        one.challenge,
        otp(one.secret, f.time),
        ip,
      ),
    ).toThrow();
    f.auth.cancelEnrollment(f.identity);
    expect(() =>
      f.auth.confirmEnrollment(
        f.identity,
        two.challenge,
        otp(two.secret, f.time),
        ip,
      ),
    ).toThrow();
    expect(f.auth.securityStatus(f.identity).mfaEnabled).toBe(false);
  });
});
it('password alone grants no access; wrong, expired, reused challenge and old/outside-drift TOTP fail; ±one step is explicit', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const challenge = await f.auth.login('fixture', password, ip);
    expect(challenge.mfaRequired).toBe(true);
    expect(f.auth.authenticate(challenge.token)).toBeNull();
    const before = p.db.select().from(sessions).all();
    for (const code of [
      'bad',
      otp(f.enrollment.secret, f.time - 90_000),
      otp(f.enrollment.secret, f.time + 90_000),
      otp(f.enrollment.secret, epoch),
    ])
      expect(() => f.auth.completeMfa(challenge.token, code, ip)).toThrow();
    expect(p.db.select().from(sessions).all()).toEqual(before);
    const credential = f.auth.completeMfa(
      challenge.token,
      otp(f.enrollment.secret, f.time + 30_000),
      ip,
    );
    expect(f.auth.authenticate(credential.token)).not.toBeNull();
    expect(() =>
      f.auth.completeMfa(
        challenge.token,
        otp(f.enrollment.secret, f.time + 30_000),
        ip,
      ),
    ).toThrow();
    const expired = await f.auth.login('fixture', password, ip);
    f.advance(5 * 60_000);
    expect(() =>
      f.auth.completeMfa(expired.token, otp(f.enrollment.secret, f.time), ip),
    ).toThrow();
    const past = await f.auth.login('fixture', password, ip);
    expect(
      f.auth.authenticate(
        f.auth.completeMfa(
          past.token,
          otp(f.enrollment.secret, f.time - 30_000),
          ip,
        ).token,
      ),
    ).not.toBeNull();
  });
});
it('parallel TOTP and recovery consumption accept exactly once across separate real SQLite connections and restart', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const a = await f.auth.login('fixture', password, ip);
    const b = await f.auth.login('fixture', password, ip);
    const second = new Persistence(p.storage);
    try {
      const other = new AuthService(second, () => f.time);
      const attempts = await Promise.allSettled([
        Promise.resolve().then(() =>
          f.auth.completeMfa(a.token, otp(f.enrollment.secret, f.time), ip),
        ),
        Promise.resolve().then(() =>
          other.completeMfa(b.token, otp(f.enrollment.secret, f.time), ip),
        ),
      ]);
      expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const c = await f.auth.login('fixture', password, ip);
      const d = await f.auth.login('fixture', password, ip);
      const recovery = await Promise.allSettled([
        Promise.resolve().then(() =>
          f.auth.completeMfa(c.token, enabled.codes[0].toUpperCase(), ip),
        ),
        Promise.resolve().then(() =>
          other.completeMfa(d.token, enabled.codes[0], ip),
        ),
      ]);
      expect(recovery.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(f.auth.securityStatus(f.identity).recoveryCodesRemaining).toBe(9);
    } finally {
      await second.close();
    }
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      const restarted = new AuthService(reopened, () => f.time);
      const pending = await restarted.login('fixture', password, ip);
      expect(() =>
        restarted.completeMfa(pending.token, enabled.codes[0], ip),
      ).toThrow();
      expect(() =>
        restarted.completeMfa(
          pending.token,
          otp(f.enrollment.secret, f.time),
          ip,
        ),
      ).toThrow();
      expect(
        restarted.authenticate(
          restarted.completeMfa(pending.token, enabled.codes[1], ip).token,
        ),
      ).not.toBeNull();
    } finally {
      await reopened.close();
    }
  });
});
it('MFA completion transaction failure rolls back code, challenge and session so retry remains safe', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const pending = await f.auth.login('fixture', password, ip);
    p.write((tx) =>
      tx.run(
        sql`CREATE TRIGGER fail_mfa BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic'); END`,
      ),
    );
    expect(() =>
      f.auth.completeMfa(pending.token, enabled.codes[0], ip),
    ).toThrow(/synthetic/);
    expect(f.auth.securityStatus(f.identity).recoveryCodesRemaining).toBe(10);
    p.write((tx) => tx.run(sql`DROP TRIGGER fail_mfa`));
    expect(
      f.auth.authenticate(
        f.auth.completeMfa(pending.token, enabled.codes[0], ip).token,
      ),
    ).not.toBeNull();
  });
});
it('fresh authentication requires both factors, binds exact scope/session/revision and expires; login is not a grant', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    await expect(
      f.auth.freshAuth(
        f.identity,
        'backup-download',
        'wrong',
        enabled.codes[0],
        ip,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(
      f.auth.freshAuth(f.identity, 'backup-download', password, undefined, ip),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(f.auth.securityStatus(f.identity).recoveryCodesRemaining).toBe(10);
    const grant = await f.grant('backup-download');
    const consume = (
      scope: FreshAuthScope,
      token = grant,
      identity = f.identity,
    ) => p.write((tx) => f.auth.consumeFreshGrant(tx, identity, token, scope));
    expect(() => consume('backup-create')).toThrow(/Authenticate again/);
    expect(() => consume('backup-download', f.initial.token)).toThrow(
      /Authenticate again/,
    );
    const pending = await f.auth.login('fixture', password, ip);
    const other = f.auth.authenticate(
      f.auth.completeMfa(pending.token, enabled.codes[0], ip).token,
    )!;
    expect(() => consume('backup-download', grant, other)).toThrow(
      /Authenticate again/,
    );
    consume('backup-download');
    expect(() => consume('backup-download')).toThrow(/Authenticate again/);
    const expired = await f.grant('restore');
    f.advance(5 * 60_000);
    expect(() => consume('restore', expired)).toThrow(/Authenticate again/);
    const revision = await f.grant('backup-delete');
    p.write((tx) =>
      tx
        .update(account)
        .set({ securityRevision: f.identity.securityRevision + 1 })
        .run(),
    );
    expect(() => consume('backup-delete', revision)).toThrow();
  });
});
it('password, recovery regeneration and disable rotate sessions and reject prior pending challenges and recovery sets', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const pending = await f.auth.login('fixture', password, ip);
    const regenerated = f.auth.regenerateRecoveryCodes(
      f.identity,
      await f.grant('recovery-regenerate'),
    );
    expect(f.auth.authenticate(enabled.credential.token)).toBeNull();
    expect(() =>
      f.auth.completeMfa(pending.token, enabled.codes[0], ip),
    ).toThrow();
    const identity = f.auth.authenticate(regenerated.credential.token)!;
    const fresh = await f.auth.freshAuth(
      identity,
      'password-change',
      password,
      regenerated.codes[0],
      ip,
    );
    const changed = await f.auth.changePassword(
      identity,
      fresh.token,
      replacement,
    );
    expect(f.auth.authenticate(regenerated.credential.token)).toBeNull();
    await expect(f.auth.login('fixture', password, ip)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const newPending = await f.auth.login('fixture', replacement, ip);
    expect(() =>
      f.auth.completeMfa(newPending.token, enabled.codes[1], ip),
    ).toThrow();
    const current = f.auth.authenticate(changed.token)!;
    const disable = await f.auth.freshAuth(
      current,
      'mfa-disable',
      replacement,
      regenerated.codes[1],
      ip,
    );
    const disabled = f.auth.disableMfa(current, disable.token);
    expect(f.auth.authenticate(changed.token)).toBeNull();
    expect(f.auth.authenticate(disabled.token)!.account.mfaEnabled).toBe(false);
    expect(p.db.select().from(recoveryCodes).all()).toEqual([]);
    expect(p.db.select().from(account).get()!.totpSecretEncrypted).toBeNull();
    expect(
      (await f.auth.login('fixture', replacement, ip)).mfaRequired,
    ).toBeUndefined();
  });
});
it('changing authenticator keeps old MFA until confirmation, replaces secret and invalidates old recovery codes', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const enrollment = f.auth.startEnrollment(
      f.identity,
      await f.grant('mfa-enroll'),
    );
    expect(f.auth.securityStatus(f.identity).mfaEnabled).toBe(true);
    const old = p.db.select().from(account).get()!.totpSecretEncrypted;
    expect(() =>
      f.auth.confirmEnrollment(f.identity, enrollment.challenge, 'bad', ip),
    ).toThrow();
    expect(p.db.select().from(account).get()!.totpSecretEncrypted).toBe(old);
    const changed = f.auth.confirmEnrollment(
      f.identity,
      enrollment.challenge,
      otp(enrollment.secret, f.time),
      ip,
    );
    expect(p.db.select().from(account).get()!.totpSecretEncrypted).not.toBe(
      old,
    );
    const pending = await f.auth.login('fixture', password, ip);
    expect(() =>
      f.auth.completeMfa(pending.token, enabled.codes[0], ip),
    ).toThrow();
    expect(
      f.auth.authenticate(
        f.auth.completeMfa(pending.token, changed.codes[0], ip).token,
      ),
    ).not.toBeNull();
  });
});
it('password-only fresh authentication changes session lifetime and revoke-all invalidates every session and grant', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => epoch);
    const initial = await createFixtureAccount(auth, password, ip);
    const second = await auth.login('fixture', password, ip);
    const identity = auth.authenticate(initial.token)!;
    const wrongScope = await auth.freshAuth(
      identity,
      'backup-create',
      password,
      undefined,
      ip,
    );
    expect(() =>
      auth.changeSessionLifetime(identity, wrongScope.token, 1),
    ).toThrow(/Authenticate again/);
    const grant = await auth.freshAuth(
      identity,
      'session-lifetime',
      password,
      undefined,
      ip,
    );
    const changed = auth.changeSessionLifetime(identity, grant.token, 1);
    expect(changed.expiresAt).toBe(epoch + 86_400_000);
    expect(auth.authenticate(initial.token)).toBeNull();
    expect(auth.authenticate(second.token)).toBeNull();
    const current = auth.authenticate(changed.token)!;
    const revoke = await auth.freshAuth(
      current,
      'sessions-revoke',
      password,
      undefined,
      ip,
    );
    auth.revokeAll(current, revoke.token);
    expect(auth.authenticate(changed.token)).toBeNull();
    expect(p.db.select().from(sessions).all()).toEqual([]);
    expect(p.db.select().from(authChallenges).all()).toEqual([]);
  });
});
it('expiry or concurrent security revision during password change cannot commit stale credentials', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const grant = await f.grant('password-change');
    const before = p.db.select().from(account).get()!.passwordHash;
    const pending = f.auth.changePassword(f.identity, grant, replacement);
    f.advance(5 * 60_000);
    await expect(pending).rejects.toMatchObject({
      code: 'fresh-auth-required',
    });
    expect(p.db.select().from(account).get()!.passwordHash).toBe(before);
    const second = f.auth.changePassword(
      f.identity,
      await f.grant('password-change'),
      replacement,
    );
    p.write((tx) =>
      tx
        .update(account)
        .set({ securityRevision: f.identity.securityRevision + 1 })
        .run(),
    );
    await expect(second).rejects.toMatchObject({ code: 'unauthorized' });
    expect(p.db.select().from(account).get()!.passwordHash).toBe(before);
  });
});
it('MFA/fresh-auth/enrollment rate limits persist and challenge storage stays bounded without plaintext tokens', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    p.write((tx) => {
      for (let i = 0; i < 100; i++)
        tx.insert(authChallenges)
          .values({
            tokenHash: tokenHash('challenge', newAuthToken()),
            accountId: f.identity.account.id,
            securityRevision: f.identity.securityRevision,
            kind: 'mfa',
            scope: 'login',
            createdAt: epoch,
            expiresAt: epoch + 600_000,
          })
          .run();
    });
    const pending = await f.auth.login('fixture', password, ip);
    expect(p.db.select().from(authChallenges).all()).toHaveLength(100);
    expect(
      JSON.stringify(p.db.select().from(authChallenges).all()),
    ).not.toContain(pending.token);
    for (const action of ['mfa', 'fresh-auth', 'enrollment'] as const) {
      const limiter = new AuthRateLimiter(p);
      for (let i = 0; i < 10; i++)
        limiter.attempt(action, '192.0.2.99', f.time);
      expect(() =>
        new AuthRateLimiter(p).attempt(action, '192.0.2.99', f.time),
      ).toThrow(/Too many/);
    }
  });
});
it('account-update fresh grants require the enabled factor, bind one use and leave current sessions valid', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    await expect(
      f.auth.freshAuth(f.identity, 'account-update', password, undefined, ip),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    const grant = await f.auth.freshAuth(
      f.identity,
      'account-update',
      password,
      enabled.codes[0],
      ip,
    );
    expect(
      f.auth.updateAccount(f.identity, grant.token, {
        username: 'new.owner',
        email: 'new@example.invalid',
      }),
    ).toEqual({ username: 'new.owner', email: 'new@example.invalid' });
    expect(f.auth.authenticate(enabled.credential.token)).not.toBeNull();
    expect(() =>
      f.auth.updateAccount(f.identity, grant.token, {
        username: 'other',
        email: 'new@example.invalid',
      }),
    ).toThrow(/Authenticate again/);
    const pending = await f.auth.login('NEW.OWNER', password, ip);
    expect(pending.mfaRequired).toBe(true);
    expect(f.auth.authenticate(pending.token)).toBeNull();
  });
});
it('operator reset on a second connection is atomic and immediately invalidates uncached credentials, factors, grants and sessions', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const before = p.db.select().from(account).get()!;
    const operator = new Persistence(p.storage);
    try {
      const auth = new AuthService(operator);
      await expect(auth.resetPassword('short')).rejects.toThrow();
      p.native.exec(
        "CREATE TRIGGER reset_fault BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END",
      );
      await expect(auth.resetPassword(replacement)).rejects.toThrow();
      expect(p.db.select().from(account).get()).toEqual(before);
      expect(f.auth.authenticate(enabled.credential.token)).not.toBeNull();
      expect(p.db.select().from(recoveryCodes).all()).toHaveLength(10);
      p.native.exec('DROP TRIGGER reset_fault');
      await auth.resetPassword(replacement);
      expect(f.auth.authenticate(enabled.credential.token)).toBeNull();
      expect(p.db.select().from(recoveryCodes).all()).toEqual([]);
      expect(p.db.select().from(authChallenges).all()).toEqual([]);
      expect(p.db.select().from(sessions).all()).toEqual([]);
      expect(p.db.select().from(account).get()).toMatchObject({
        totpEnabled: 0,
        totpSecretEncrypted: null,
        lastTotpStep: null,
        securityRevision: before.securityRevision + 1,
      });
      await expect(f.auth.login('fixture', password, ip)).rejects.toMatchObject(
        { code: 'unauthorized' },
      );
      const logged = await f.auth.login('fixture', replacement, ip);
      expect(logged.mfaRequired).not.toBe(true);
      expect(f.auth.authenticate(logged.token)).not.toBeNull();
      expect(p.native.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(p.native.pragma('foreign_key_check')).toEqual([]);
    } finally {
      await operator.close();
    }
  });
});
it('MFA honors the trusted device: a flooded mfa account bucket blocks no-device and forged-device callers but not the real device token (SEC-LOCK-4)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    // Full sign-in at the current security revision issues the device token.
    const first = await f.auth.login('fixture', password, ip);
    const signedIn = f.auth.completeMfa(
      first.token,
      otp(f.enrollment.secret, f.time),
      ip,
    );
    const device = signedIn.device!.token;
    const deviceId = device.split('.')[1];
    f.advance(); // the sign-in consumed this TOTP step (replay is rejected)
    // Anonymous junk from rotating addresses fills the shared mfa account bucket
    // (the sign-in above already counted one attempt there; the limit is 10).
    const limiter = new AuthRateLimiter(p);
    for (let i = 0; i < 9; i++)
      limiter.attempt('mfa', `198.51.100.${i + 1}`, f.time);
    const pending = await f.auth.login('fixture', password, ip);
    const code = otp(f.enrollment.secret, f.time);
    // The rate-limited attempts do not consume the challenge.
    expect(() => f.auth.completeMfa(pending.token, code, ip)).toThrow(
      /Too many/,
    );
    const forged = device.replace(/[^.]+$/, 'A'.repeat(43));
    expect(() => f.auth.completeMfa(pending.token, code, ip, forged)).toThrow(
      /Too many/,
    );
    const done = f.auth.completeMfa(pending.token, code, ip, device);
    expect(f.auth.authenticate(done.token)).not.toBeNull();
    expect(done.device!.token.split('.')[1]).toBe(deviceId);
  });
});
it('every security change re-issues the same trusted device at the new revision; revokeAll issues none (SEC-LOCK-5)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const limiter = new AuthRateLimiter(p);
    const revisionOf = () =>
      (
        p.native
          .prepare('SELECT security_revision AS r FROM account')
          .get() as { r: number }
      ).r;
    let device = f.initial.device!.token;
    const deviceId = device.split('.')[1];
    let pw = password;
    let n = 0;
    // Flood the account-wide login bucket once; only a trusted device may sign in.
    for (let i = 0; i < 30; i++)
      limiter.attempt('login', `198.51.100.${i + 1}`, f.time);
    const check = async (
      credential: { token: string; device?: { token: string } },
      note: string,
    ) => {
      const next = credential.device!;
      expect(next.token.split('.')[1], note).toBe(deviceId);
      expect(next.token.split('.')[3], note).toBe(String(revisionOf()));
      expect(next.token, note).not.toBe(device);
      // The old token is stale; the re-issued one passes the flooded bucket.
      await expect(
        f.auth.login('fixture', pw, `203.0.113.${++n}`, device),
        note,
      ).rejects.toThrow(/Too many/);
      await expect(
        f.auth.login('fixture', pw, `203.0.113.${++n}`, next.token),
        note,
      ).resolves.toBeDefined();
      device = next.token;
      return f.auth.authenticate(credential.token)!;
    };
    const fresh = async (
      identity: NonNullable<ReturnType<typeof f.auth.authenticate>>,
      scope: FreshAuthScope,
      code?: string,
    ) => {
      const g = await f.auth.freshAuth(identity, scope, pw, code, ip);
      f.advance();
      return g.token;
    };

    // MFA enable (confirmEnrollment)
    const enabled = f.auth.confirmEnrollment(
      f.identity,
      f.enrollment.challenge,
      otp(f.enrollment.secret, f.time),
      ip,
      device,
    );
    f.advance();
    let identity = await check(enabled.credential, 'enable');
    const code = () => otp(f.enrollment.secret, f.time);
    // Recovery regeneration
    const regenerated = f.auth.regenerateRecoveryCodes(
      identity,
      await fresh(identity, 'recovery-regenerate', code()),
      device,
    );
    identity = await check(regenerated.credential, 'regenerate');
    // Session lifetime
    identity = await check(
      f.auth.changeSessionLifetime(
        identity,
        await fresh(identity, 'session-lifetime', code()),
        3,
        device,
      ),
      'lifetime',
    );
    // MFA disable
    identity = await check(
      f.auth.disableMfa(
        identity,
        await fresh(identity, 'mfa-disable', code()),
        device,
      ),
      'disable',
    );
    // Password change
    const grant = await fresh(identity, 'password-change');
    const changed = await f.auth.changePassword(
      identity,
      grant,
      replacement,
      device,
    );
    pw = replacement;
    identity = await check(changed, 'password');
    // A request without a valid device token still gets a new trusted device id.
    const noDevice = f.auth.changeSessionLifetime(
      identity,
      await fresh(identity, 'session-lifetime'),
      4,
    );
    expect(noDevice.device!.token.split('.')[1]).not.toBe(deviceId);
    expect(noDevice.device!.token.split('.')[3]).toBe(String(revisionOf()));
    identity = f.auth.authenticate(noDevice.token)!;
    // revokeAll issues no device token and invalidates the old one.
    const revoked = f.auth.revokeAll(
      identity,
      await fresh(identity, 'sessions-revoke'),
    );
    expect(revoked).toBeUndefined();
    await expect(
      f.auth.login('fixture', pw, `203.0.113.${++n}`, noDevice.device!.token),
    ).rejects.toThrow(/Too many/);
  });
}, 60_000);

// SH3.2: per-challenge cap, lower MFA account limit, daily failure cap.
const wrongCode = '000000';
const fromIp = (n: number) => `198.51.100.${n}`;
function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

it('the 5th wrong code deletes the challenge; the next code gets mfa_restart even when valid, and a new sign-in works (SEC-MFA-1, SEC-MFA-2, SEC-MFA-5)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const pending = await f.auth.login('fixture', password, ip);
    for (let i = 1; i <= 3; i++)
      expect(
        thrown(() => f.auth.completeMfa(pending.token, wrongCode, fromIp(i))),
      ).toMatchObject({ code: 'unauthorized' });
    // A new service instance shares the persisted per-challenge count.
    const restarted = new AuthService(p, () => f.time);
    for (let i = 4; i <= 5; i++)
      expect(
        thrown(() =>
          restarted.completeMfa(pending.token, wrongCode, fromIp(i)),
        ),
      ).toMatchObject({ code: 'unauthorized' });
    const tokenKey = tokenHash('challenge', pending.token);
    expect(
      p.db
        .select()
        .from(authChallenges)
        .all()
        .some((row) => row.tokenHash === tokenKey),
    ).toBe(false);
    const valid = otp(f.enrollment.secret, f.time);
    expect(
      thrown(() => f.auth.completeMfa(pending.token, valid, fromIp(6))),
    ).toMatchObject({
      code: 'mfa_restart',
      message: 'Enter your password again.',
    });
    const again = await f.auth.login('fixture', password, fromIp(7));
    const credential = f.auth.completeMfa(again.token, valid, fromIp(8));
    expect(f.auth.authenticate(credential.token)).not.toBeNull();
  });
});

it('the mfa account bucket allows 10 untrusted attempts per 15 minutes; the 11th is rate-limited with Retry-After 900 (SEC-MFA-3)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const pending = await f.auth.login('fixture', password, ip);
    for (let i = 1; i <= 10; i++)
      expect(() =>
        f.auth.completeMfa(pending.token, wrongCode, fromIp(i)),
      ).toThrow();
    const valid = otp(f.enrollment.secret, f.time);
    const limited = thrown(() =>
      f.auth.completeMfa(pending.token, valid, fromIp(11)),
    );
    expect(limited).toBeInstanceOf(RateLimitError);
    expect(limited).toMatchObject({
      code: 'rate-limited',
      retryAfterSeconds: 900,
    });
    // The fixed window ends 15 minutes after its first attempt.
    f.advance(15 * 60_000);
    const later = await f.auth.login('fixture', password, fromIp(12));
    const next = otp(f.enrollment.secret, f.time);
    expect(
      f.auth.authenticate(
        f.auth.completeMfa(later.token, next, fromIp(13)).token,
      ),
    ).not.toBeNull();
  });
});

it('30 failed codes in 24 hours block the untrusted MFA path with the daily message; a trusted device still completes MFA; the cap survives a new instance (SEC-MFA-4, SEC-MFA-5)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const first = await f.auth.login('fixture', password, ip);
    const device = f.auth.completeMfa(
      first.token,
      otp(f.enrollment.secret, f.time),
      ip,
    ).device!.token;
    let attempts = 0;
    for (let window = 0; window < 3; window++) {
      f.advance(16 * 60_000); // each window holds 10 mfa attempts (two challenges)
      for (let challenge = 0; challenge < 2; challenge++) {
        const pending = await f.auth.login('fixture', password, ip);
        for (let i = 0; i < 5; i++) {
          attempts += 1;
          expect(
            thrown(() =>
              f.auth.completeMfa(pending.token, wrongCode, fromIp(attempts)),
            ),
          ).toMatchObject({ code: 'unauthorized' });
        }
      }
    }
    expect(attempts).toBe(30);
    f.advance(16 * 60_000);
    const pending = await f.auth.login('fixture', password, ip);
    const valid = otp(f.enrollment.secret, f.time);
    const blocked = thrown(() =>
      f.auth.completeMfa(pending.token, valid, fromIp(200)),
    );
    expect(blocked).toMatchObject({
      code: 'rate-limited',
      message:
        'Too many incorrect codes today. Sign in from a device you used before, or try again tomorrow.',
    });
    expect((blocked as RateLimitError).retryAfterSeconds).toBeGreaterThan(900);
    const restarted = new AuthService(p, () => f.time);
    expect(
      thrown(() => restarted.completeMfa(pending.token, valid, fromIp(201))),
    ).toMatchObject({ code: 'rate-limited' });
    const done = f.auth.completeMfa(pending.token, valid, fromIp(202), device);
    expect(f.auth.authenticate(done.token)).not.toBeNull();
  });
});

it('wrong second factors in fresh authentication count toward the daily cap (SEC-MFA-7)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const limiter = new AuthRateLimiter(p);
    p.write((tx) => {
      for (let i = 0; i < 29; i++)
        limiter.countFailure(
          tx,
          DAILY_MFA_FAILURES,
          MFA_DAILY_FAILURES.windowMs,
          f.time,
        );
    });
    await expect(
      f.auth.freshAuth(
        f.identity,
        'mfa-enroll',
        password,
        wrongCode,
        fromIp(1),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    const pending = await f.auth.login('fixture', password, ip);
    expect(
      thrown(() =>
        f.auth.completeMfa(
          pending.token,
          otp(f.enrollment.secret, f.time),
          fromIp(2),
        ),
      ),
    ).toMatchObject({ code: 'rate-limited' });
  });
});

it('a recovery code completes MFA exactly once and a used TOTP step cannot be replayed (SEC-MFA-8)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const enabled = f.enable();
    const first = await f.auth.login('fixture', password, fromIp(1));
    const session = f.auth.completeMfa(
      first.token,
      enabled.codes[0].toUpperCase(),
      fromIp(2),
    );
    expect(f.auth.authenticate(session.token)).not.toBeNull();
    const reused = await f.auth.login('fixture', password, fromIp(3));
    expect(
      thrown(() =>
        f.auth.completeMfa(reused.token, enabled.codes[0], fromIp(4)),
      ),
    ).toMatchObject({ code: 'unauthorized' });
    const code = otp(f.enrollment.secret, f.time);
    const totp = await f.auth.login('fixture', password, fromIp(5));
    expect(
      f.auth.authenticate(
        f.auth.completeMfa(totp.token, code, fromIp(6)).token,
      ),
    ).not.toBeNull();
    const replay = await f.auth.login('fixture', password, fromIp(7));
    expect(
      thrown(() => f.auth.completeMfa(replay.token, code, fromIp(8))),
    ).toMatchObject({ code: 'unauthorized' });
  });
});

it('mfa_restart maps to 401 and rate-limit errors carry their own Retry-After (SEC-MFA-2)', () => {
  const restart = authErrorResponse(
    new DomainError('mfa_restart', 'Enter your password again.'),
  );
  expect(restart.status).toBe(401);
  const limited = authErrorResponse(new RateLimitError('Too many.', 86_000));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('86000');
});

it('the owner notice counts wrong codes on both MFA paths and clears on the next successful sign-in (SEC-MFA-11)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    const pending = await f.auth.login('fixture', password, ip);
    for (let i = 1; i <= 2; i++)
      expect(
        thrown(() => f.auth.completeMfa(pending.token, wrongCode, fromIp(i))),
      ).toMatchObject({ code: 'unauthorized' });
    expect(f.auth.securityStatus(f.identity).failedSecondFactorAttempts).toBe(
      2,
    );
    // The count is persisted, so a new service instance reports it too.
    const restarted = new AuthService(p, () => f.time);
    expect(
      restarted.securityStatus(f.identity).failedSecondFactorAttempts,
    ).toBe(2);
    // A correct code on the same challenge is a sign-in and clears the notice.
    const ok = f.auth.completeMfa(
      pending.token,
      otp(f.enrollment.secret, f.time),
      fromIp(3),
    );
    expect(f.auth.securityStatus(f.identity).failedSecondFactorAttempts).toBe(
      0,
    );
    // A wrong code with a trusted device is counted as well.
    f.advance();
    const next = await f.auth.login('fixture', password, fromIp(4));
    expect(
      thrown(() =>
        f.auth.completeMfa(next.token, wrongCode, fromIp(5), ok.device!.token),
      ),
    ).toMatchObject({ code: 'unauthorized' });
    expect(f.auth.securityStatus(f.identity).failedSecondFactorAttempts).toBe(
      1,
    );
  });
});

it('wrong codes in fresh authentication count too; the notice window is 30 days from its first failure (SEC-MFA-12)', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    f.enable();
    await expect(
      f.auth.freshAuth(
        f.identity,
        'mfa-enroll',
        password,
        wrongCode,
        fromIp(1),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(f.auth.securityStatus(f.identity).failedSecondFactorAttempts).toBe(
      1,
    );
    // The window is fixed at its first failure: live until 30 days later, then gone.
    // (Read through the limiter: the session itself expires before 30 days.)
    const limiter = new AuthRateLimiter(p);
    const start = f.time;
    expect(
      limiter.failureCount(
        p.db,
        FAILURES_SINCE_SUCCESS,
        start + FAILURES_SINCE_SUCCESS_WINDOW_MS - 1,
      ),
    ).toBe(1);
    expect(
      limiter.failureCount(
        p.db,
        FAILURES_SINCE_SUCCESS,
        start + FAILURES_SINCE_SUCCESS_WINDOW_MS,
      ),
    ).toBe(0);
  });
});
