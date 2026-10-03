import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { account, sessions } from '../../src/lib/server/db/schema.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import {
  AuthRateLimiter,
  MAX_RATE_BUCKETS,
} from '../../src/lib/server/auth/rate-limits.ts';
import {
  hashPassword,
  verifyPassword,
} from '../../src/lib/server/auth/passwords.ts';
import { newAuthToken, tokenHash } from '../../src/lib/server/auth/tokens.ts';
import {
  replaceSettings,
  readSettings,
} from '../../src/lib/server/settings/repository.ts';

const password = 'synthetic only: 密碼-not-a-live-credential';
const now = 1_800_000_000_000;
const ip = '192.0.2.1';

it('uses real salted Argon2id with exact password bytes, bounded parameters and one in-flight operation', async () => {
  const pending = hashPassword(password);
  await expect(hashPassword(password)).rejects.toMatchObject({ code: 'busy' });
  const hash = await pending;
  expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$/);
  expect(await hashPassword(password)).not.toBe(hash);
  expect(await verifyPassword(hash, password)).toBe(true);
  expect(await verifyPassword(hash, password + ' ')).toBe(false);
  expect(
    await verifyPassword(hash.replace('m=65536', 'm=999999999'), password),
  ).toBe(false);
  expect(await verifyPassword('corrupt', password)).toBe(false);
  expect(() => hashPassword('short')).toThrow();
});
it('requires an operator token, invalidates reissued/expired tokens and atomically creates only one account with hashed session', async () => {
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time);
    await expect(
      auth.setup(newAuthToken(), password, ip),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    const old = auth.issueSetupToken();
    const token = auth.issueSetupToken();
    expect(token).not.toBe(old);
    await expect(auth.setup(old, password, ip)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    time += 60 * 60_000;
    await expect(auth.setup(token, password, ip)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const current = auth.issueSetupToken();
    const credential = await auth.setup(current, password, ip);
    expect(credential.expiresAt).toBe(time + 7 * 86_400_000);
    const identity = auth.authenticate(credential.token)!;
    expect(Object.keys(identity.account).sort()).toEqual(['id', 'mfaEnabled']);
    expect(identity.account.mfaEnabled).toBe(false);
    await expect(auth.setup(current, password, ip)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(() => auth.issueSetupToken()).toThrow(/already exists/);
    const inspector = new Database(p.storage.databasePath, { readonly: true });
    try {
      expect(
        inspector.prepare('SELECT count(*) AS n FROM account').get(),
      ).toEqual({ n: 1 });
      expect(inspector.prepare('SELECT * FROM setup_tokens').all()).toEqual([]);
      const stored = inspector
        .prepare('SELECT token_hash FROM sessions')
        .get() as { token_hash: string };
      expect(stored.token_hash).toBe(tokenHash('session', credential.token));
      const dump =
        JSON.stringify(inspector.prepare('SELECT * FROM account').all()) +
        JSON.stringify(inspector.prepare('SELECT * FROM sessions').all());
      for (const secret of [password, current, credential.token])
        expect(dump).not.toContain(secret);
      expect(inspector.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(inspector.pragma('foreign_key_check')).toEqual([]);
    } finally {
      inspector.close();
    }
  });
});
it('concurrent setup cannot create a second account and expiry during hashing cannot consume a stale token', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const token = auth.issueSetupToken();
    const results = await Promise.allSettled([
      auth.setup(token, password, ip),
      auth.setup(token, password, '192.0.2.2'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(p.native.prepare('SELECT count(*) AS n FROM account').get()).toEqual(
      { n: 1 },
    );
  });
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time);
    const token = auth.issueSetupToken();
    const pending = auth.setup(token, password, ip);
    time += 60 * 60_000;
    await expect(pending).rejects.toMatchObject({ code: 'unauthorized' });
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
    expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual([]);
    expect(
      p.native.prepare('SELECT count(*) AS n FROM setup_tokens').get(),
    ).toEqual({ n: 1 });
  });
});
it('failure during session commit rolls back account and token consumption, allowing a safe retry', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const token = auth.issueSetupToken();
    p.write((tx) =>
      tx.run(
        sql`CREATE TRIGGER synthetic_fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic'); END`,
      ),
    );
    await expect(auth.setup(token, password, ip)).rejects.toThrow(/synthetic/);
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
    expect(
      p.native.prepare('SELECT count(*) AS n FROM setup_tokens').get(),
    ).toEqual({ n: 1 });
    p.write((tx) => tx.run(sql`DROP TRIGGER synthetic_fail_session`));
    expect(
      auth.authenticate((await auth.setup(token, password, ip)).token),
    ).not.toBeNull();
  });
});
it('login, logout, revoked/expired/security-revision sessions and configured lifetimes use real persistence', async () => {
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time);
    await expect(auth.login('wrong', ip)).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Unable to sign in. Check your credentials.',
    });
    const initial = await auth.setup(auth.issueSetupToken(), password, ip);
    await expect(auth.login('wrong', ip)).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Unable to sign in. Check your credentials.',
    });
    const second = await auth.login(password, ip);
    auth.logout(auth.authenticate(initial.token)!);
    expect(auth.authenticate(initial.token)).toBeNull();
    expect(auth.authenticate(second.token)).not.toBeNull();
    expect(auth.authenticate(newAuthToken())).toBeNull();
    expect(auth.authenticate('../bad')).toBeNull();
    p.write((tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: time })
        .where(eq(sessions.tokenHash, tokenHash('session', second.token)))
        .run(),
    );
    expect(auth.authenticate(second.token)).toBeNull();
    replaceSettings(p, { ...readSettings(p), sessionLifetimeDays: 1 });
    const oneDay = await auth.login(password, ip);
    expect(oneDay.expiresAt).toBe(time + 86_400_000);
    time = oneDay.expiresAt;
    expect(auth.authenticate(oneDay.token)).toBeNull();
    const next = await auth.login(password, ip);
    p.write((tx) => tx.update(account).set({ securityRevision: 2 }).run());
    expect(auth.authenticate(next.token)).toBeNull();
    expect(p.native.pragma('foreign_key_check')).toEqual([]);
  });
});
it('a security revision change while password verification is in flight rejects the stale login', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    await auth.setup(auth.issueSetupToken(), password, ip);
    const before = p.native.prepare('SELECT * FROM sessions').all();
    const pending = auth.login(password, ip);
    p.write((tx) => tx.update(account).set({ securityRevision: 2 }).run());
    await expect(pending).rejects.toMatchObject({ code: 'unauthorized' });
    expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual(before);
  });
});
it('successful login bounds the session table and preserves its newest credential', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const initial = await auth.setup(auth.issueSetupToken(), password, ip);
    const owner = auth.authenticate(initial.token)!.account.id;
    p.write((tx) => {
      for (let i = 0; i < 100; i++)
        tx.insert(sessions)
          .values({
            tokenHash: tokenHash('session', newAuthToken()),
            accountId: owner,
            securityRevision: 1,
            createdAt: now - 1000 - i,
            expiresAt: now + 86_400_000,
          })
          .run();
    });
    const latest = await auth.login(password, ip);
    expect(
      p.native.prepare('SELECT count(*) AS n FROM sessions').get(),
    ).toEqual({ n: 100 });
    expect(auth.authenticate(latest.token)).not.toBeNull();
  });
});
it('MFA-enabled rows create only pending challenges; password success never creates a full session', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const initial = await auth.setup(auth.issueSetupToken(), password, ip);
    p.write((tx) =>
      tx
        .update(account)
        .set({
          totpEnabled: 1,
          totpSecretEncrypted: 'synthetic-test-only',
          securityRevision: 2,
        })
        .run(),
    );
    expect(auth.authenticate(initial.token)).toBeNull();
    const before = p.native.prepare('SELECT * FROM sessions').all();
    const pending = await auth.login(password, ip);
    expect(pending.mfaRequired).toBe(true);
    expect(auth.authenticate(pending.token)).toBeNull();
    expect(() => auth.completeMfa(pending.token, '123456', ip)).toThrow();
    expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual(before);
  });
});
it('rate limits persist across restart, have fixed expiry, complement rotating IPs and bound storage', async () => {
  await withPersistence(async (p) => {
    const limiter = new AuthRateLimiter(p);
    for (let i = 0; i < 10; i++) limiter.attempt('login', ip, now);
    const before = p.native.prepare('SELECT * FROM auth_rate_limits').all();
    expect(() => limiter.attempt('login', ip, now + 60_000)).toThrow(
      /Too many/,
    );
    expect(p.native.prepare('SELECT * FROM auth_rate_limits').all()).toEqual(
      before,
    );
    expect(JSON.stringify(before)).not.toContain(ip);
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      const afterRestart = new AuthRateLimiter(reopened);
      expect(() => afterRestart.attempt('login', ip, now + 60_000)).toThrow(
        /Too many/,
      );
      for (let i = 0; i < 20; i++)
        afterRestart.attempt('login', `192.0.2.${i + 2}`, now + 60_000);
      expect(() =>
        afterRestart.attempt('login', '198.51.100.1', now + 60_000),
      ).toThrow(/Too many/);
      afterRestart.attempt('login', ip, now + 16 * 60_000);
      expect(
        reopened.native
          .prepare('SELECT count(*) AS n FROM auth_rate_limits')
          .get(),
      ).toEqual({ n: 2 });
      reopened.write((tx) => {
        for (let i = 0; i < MAX_RATE_BUCKETS - 2; i++)
          tx.run(
            sql`INSERT INTO auth_rate_limits VALUES (${i.toString(16).padStart(64, '0')}, 1, ${now}, NULL, ${now + 3_600_000})`,
          );
      });
      afterRestart.attempt('setup', '203.0.113.1', now + 16 * 60_000);
      expect(
        reopened.native
          .prepare('SELECT count(*) AS n FROM auth_rate_limits')
          .get(),
      ).toEqual({ n: MAX_RATE_BUCKETS });
    } finally {
      await reopened.close();
    }
  });
});
it('operator CLI emits a random token only with VPS filesystem access, reissues safely, and refuses after setup', async () => {
  await withPersistence(async (p, root) => {
    await p.close();
    const env = { ...process.env, DATA_DIR: root, NODE_ENV: 'production' };
    const run = () =>
      execFileSync(process.execPath, ['scripts/setup-token.ts'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    const first = run();
    const second = run();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    const reopened = new Persistence(p.storage);
    try {
      const auth = new AuthService(reopened);
      await expect(auth.setup(first, password, ip)).rejects.toMatchObject({
        code: 'unauthorized',
      });
      await auth.setup(second, password, ip);
    } finally {
      await reopened.close();
    }
    expect(run).toThrow();
  });
});
