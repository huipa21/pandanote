import Database from 'better-sqlite3';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { account, sessions } from '../../src/lib/server/db/schema.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { SetupCodeError } from '../../src/lib/server/auth/setup-code.ts';
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
const details = {
  username: '  Notebook.Owner  ',
  email: ' Owner@example.invalid ',
  password,
  passwordConfirm: password,
};
const preferences = {
  siteTitle: ' My notebook ',
  language: 'zh-CN',
  timezone: 'Asia/Hong_Kong',
};
// The setup code belongs to one AuthService instance (SH2.1).
const withCode = (auth: AuthService) => ({
  ...details,
  setupCode: auth.setupCode()!,
});
const wrongCode = 'ABCDE-FGHJK-MNPQR-STUVW';

it('uses real salted bounded Argon2id, exact password bytes and one in-flight operation', async () => {
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
it('creates the sole account and hashed session atomically, normalizes identity and completes preferences once', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    expect(auth.setupState()).toBe('new');
    const credential = await auth.createAccount(withCode(auth), ip);
    expect(credential.expiresAt).toBe(now + 7 * 86_400_000);
    const identity = auth.authenticate(credential.token)!;
    expect(Object.keys(identity.account).sort()).toEqual(['id', 'mfaEnabled']);
    expect(auth.setupState()).toBe('account');
    expect(auth.accountDetails(identity)).toEqual({
      username: 'notebook.owner',
      email: 'Owner@example.invalid',
    });
    await expect(auth.createAccount(withCode(auth), ip)).rejects.toMatchObject({
      code: 'already_set_up',
    });
    auth.finishSetup(identity, preferences);
    expect(auth.setupState()).toBe('complete');
    expect(readSettings(p)).toMatchObject({
      siteTitle: 'My notebook',
      language: 'zh-CN',
      timezone: 'Asia/Hong_Kong',
      setupCompletedAt: now,
      theme: 'system',
      weekStart: 1,
    });
    expect(() => auth.finishSetup(identity, preferences)).toThrow(
      /already exists/,
    );
    const inspector = new Database(p.storage.databasePath, { readonly: true });
    try {
      expect(
        inspector.prepare('SELECT count(*) AS n FROM account').get(),
      ).toEqual({ n: 1 });
      expect(
        inspector
          .prepare("SELECT name FROM sqlite_schema WHERE name='setup_tokens'")
          .all(),
      ).toEqual([]);
      expect(
        inspector.prepare('SELECT token_hash FROM sessions').get(),
      ).toEqual({ token_hash: tokenHash('session', credential.token) });
      const dump =
        JSON.stringify(inspector.prepare('SELECT * FROM account').all()) +
        JSON.stringify(inspector.prepare('SELECT * FROM sessions').all());
      for (const secret of [password, credential.token])
        expect(dump).not.toContain(secret);
      expect(inspector.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(inspector.pragma('foreign_key_check')).toEqual([]);
    } finally {
      inspector.close();
    }
  });
});
it('concurrent setup across two SQLite connections creates one account; loser gets already_set_up', async () => {
  await withPersistence(async (p) => {
    const second = new Persistence(p.storage);
    try {
      const a = new AuthService(p, () => now),
        b = new AuthService(second, () => now);
      const results = await Promise.allSettled([
        a.createAccount(withCode(a), ip),
        b.createAccount(withCode(b), '192.0.2.2'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'already_set_up' },
      });
      expect(
        p.native.prepare('SELECT count(*) AS n FROM account').get(),
      ).toEqual({ n: 1 });
      expect(
        p.native.prepare('SELECT count(*) AS n FROM sessions').get(),
      ).toEqual({ n: 1 });
    } finally {
      await second.close();
    }
  });
});
it('setup window closes at 60 minutes, rechecks after hashing and reopens on process restart', async () => {
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time, now);
    time += 61 * 60_000;
    expect(auth.setupWindowOpen()).toBe(false);
    await expect(auth.createAccount(withCode(auth), ip)).rejects.toMatchObject({
      code: 'setup_closed',
    });
    const restarted = new AuthService(p, () => time);
    expect(restarted.setupWindowOpen()).toBe(true);
    const pending = restarted.createAccount(withCode(restarted), ip);
    time += 60 * 60_000;
    await expect(pending).rejects.toMatchObject({ code: 'setup_closed' });
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
    expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual([]);
    const reopened = new AuthService(p, () => time);
    await reopened.createAccount(withCode(reopened), ip);
  });
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now + 59 * 60_000, now);
    await auth.createAccount(withCode(auth), ip);
  });
});
it('failed first-session commit rolls back the account; retry succeeds; failed preferences preserve all settings', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    p.write((tx) =>
      tx.run(
        sql`CREATE TRIGGER synthetic_fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic'); END`,
      ),
    );
    await expect(auth.createAccount(withCode(auth), ip)).rejects.toThrow(
      /synthetic/,
    );
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
    p.write((tx) => tx.run(sql`DROP TRIGGER synthetic_fail_session`));
    const identity = auth.authenticate(
      (await auth.createAccount(withCode(auth), ip)).token,
    )!;
    const before = readSettings(p);
    p.write((tx) =>
      tx.run(
        sql`CREATE TRIGGER synthetic_fail_preferences BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT, 'synthetic'); END`,
      ),
    );
    expect(() => auth.finishSetup(identity, preferences)).toThrow(/synthetic/);
    expect(readSettings(p)).toEqual(before);
    p.write((tx) => tx.run(sql`DROP TRIGGER synthetic_fail_preferences`));
    auth.finishSetup(identity, preferences);
  });
});
it('unknown username and wrong password have identical generic failures and comparable real verification timing', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p);
    await createFixtureAccount(auth, password, ip);
    const times: number[] = [];
    for (const [username, secret] of [
      ['unknown', password],
      ['fixture', 'incorrect'],
    ]) {
      const start = performance.now();
      await expect(auth.login(username, secret, ip)).rejects.toMatchObject({
        code: 'unauthorized',
        message: 'Invalid username or password.',
      });
      times.push(performance.now() - start);
    }
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(3);
    expect(
      auth.authenticate((await auth.login('  FIXTURE ', password, ip)).token),
    ).not.toBeNull();
  });
});
it('logout, revoked/expired/revision sessions, lifetimes and restart use real persistence', async () => {
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time);
    const initial = await createFixtureAccount(auth, password, ip);
    const second = await auth.login('fixture', password, ip);
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
    const oneDay = await auth.login('fixture', password, ip);
    expect(oneDay.expiresAt).toBe(time + 86_400_000);
    time = oneDay.expiresAt;
    expect(auth.authenticate(oneDay.token)).toBeNull();
    const next = await auth.login('fixture', password, ip);
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      const restarted = new AuthService(reopened, () => time);
      expect(restarted.authenticate(next.token)).not.toBeNull();
      reopened.write((tx) =>
        tx.update(account).set({ securityRevision: 2 }).run(),
      );
      expect(restarted.authenticate(next.token)).toBeNull();
    } finally {
      await reopened.close();
    }
  });
});
it('username or security revision changing during verification rejects stale login', async () => {
  for (const change of [{ securityRevision: 2 }, { username: 'changed' }])
    await withPersistence(async (p) => {
      const auth = new AuthService(p, () => now);
      await createFixtureAccount(auth, password, ip);
      const before = p.native.prepare('SELECT * FROM sessions').all();
      const pending = auth.login('fixture', password, ip);
      p.write((tx) => tx.update(account).set(change).run());
      await expect(pending).rejects.toMatchObject({ code: 'unauthorized' });
      expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual(before);
    });
});
it('successful login bounds sessions and preserves the newest credential', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const initial = await createFixtureAccount(auth, password, ip);
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
    const latest = await auth.login('fixture', password, ip);
    expect(
      p.native.prepare('SELECT count(*) AS n FROM sessions').get(),
    ).toEqual({ n: 100 });
    expect(auth.authenticate(latest.token)).not.toBeNull();
  });
});
it('MFA password success grants only a pending challenge, never a full session', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const initial = await createFixtureAccount(auth, password, ip);
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
    const pending = await auth.login('fixture', password, ip);
    expect(pending.mfaRequired).toBe(true);
    expect(auth.authenticate(pending.token)).toBeNull();
    expect(() => auth.completeMfa(pending.token, '123456', ip)).toThrow();
    expect(p.native.prepare('SELECT * FROM sessions').all()).toEqual(before);
  });
});
it('account changes consume exact fresh scope without revoking sessions; eight-character password changes work', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const initial = await createFixtureAccount(auth, password, ip);
    const identity = auth.authenticate(initial.token)!;
    expect(() =>
      auth.updateAccount(identity, newAuthToken(), {
        username: 'new',
        email: 'new@example.invalid',
      }),
    ).toThrow(/Authenticate again/);
    const wrong = await auth.freshAuth(
      identity,
      'password-change',
      password,
      undefined,
      ip,
    );
    expect(() =>
      auth.updateAccount(identity, wrong.token, {
        username: 'new',
        email: 'new@example.invalid',
      }),
    ).toThrow(/Authenticate again/);
    const grant = await auth.freshAuth(
      identity,
      'account-update',
      password,
      undefined,
      ip,
    );
    expect(() =>
      auth.updateAccount(identity, grant.token, {
        username: '!',
        email: 'bad',
      }),
    ).toThrow();
    expect(
      auth.updateAccount(identity, grant.token, {
        username: '  NEW ',
        email: ' new@example.invalid ',
      }),
    ).toEqual({ username: 'new', email: 'new@example.invalid' });
    expect(auth.authenticate(initial.token)).not.toBeNull();
    expect(() =>
      auth.updateAccount(identity, grant.token, {
        username: 'other',
        email: 'new@example.invalid',
      }),
    ).toThrow(/Authenticate again/);
    await expect(auth.login('fixture', password, ip)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(
      auth.authenticate((await auth.login('NEW', password, ip)).token),
    ).not.toBeNull();
    const fresh = await auth.freshAuth(
      identity,
      'password-change',
      password,
      undefined,
      ip,
    );
    await expect(
      auth.changePassword(identity, fresh.token, '1234567'),
    ).rejects.toThrow();
    const credential = await auth.changePassword(
      identity,
      fresh.token,
      '12345678',
    );
    expect(auth.authenticate(credential.token)).not.toBeNull();
    expect(
      auth.authenticate((await auth.login('new', '12345678', ip)).token),
    ).not.toBeNull();
  });
});
it('setup and login limits persist, have fixed expiry, complement rotating IPs and bound storage', async () => {
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
it('anonymous attempt floods cannot lock out a trusted device; reset-password clears the lockout', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const limiter = new AuthRateLimiter(p);
    const setup = await auth.createAccount(withCode(auth), ip);
    const device = setup.device!.token;
    const username = 'notebook.owner';
    const flood = () => {
      for (let i = 0; i < 30; i++)
        limiter.attempt('login', `198.51.100.${i + 1}`, now);
    };
    flood(); // anonymous junk from rotating IPs fills the account-wide bucket
    // Anonymous, junk-cookie and forged-cookie callers are denied even with the right password.
    const forged = device.replace(/[^.]+$/, 'A'.repeat(43));
    for (const token of [undefined, 'v1.junk', forged])
      await expect(
        auth.login(username, password, '203.0.113.5', token),
      ).rejects.toThrow(/Too many/);
    // A trusted device still signs in and keeps its device id.
    const ok = await auth.login(username, password, '203.0.113.5', device);
    expect(auth.authenticate(ok.token)).not.toBeNull();
    expect(
      (ok as { device: { token: string } }).device.token.split('.')[1],
    ).toBe(device.split('.')[1]);
    // The per-device bucket still bounds guessing with a stolen token.
    const id = device.split('.')[1];
    for (let i = 0; i < 29; i++)
      limiter.attempt('login', `203.0.113.${100 + i}`, now, id);
    await expect(
      auth.login(username, password, '203.0.113.9', device),
    ).rejects.toThrow(/Too many/);
    // Reset clears every bucket and invalidates old tokens (revision changes).
    await auth.resetPassword('a brand new password');
    expect(
      p.native.prepare('SELECT count(*) AS n FROM auth_rate_limits').get(),
    ).toEqual({ n: 0 });
    flood();
    await expect(
      auth.login(username, 'a brand new password', ip, device),
    ).rejects.toThrow(/Too many/);
    await auth.resetPassword('another new password');
  });
}, 30_000);

it('setup code: missing, wrong and another instance code create no account; a correct code in any case or spacing creates exactly one', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const other = new AuthService(p, () => now);
    const code = auth.setupCode()!;
    // SEC-SETUP-1: 4 groups of 5 from the 31-symbol alphabet, stable per instance.
    expect(code).toMatch(
      /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}(-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}){3}$/,
    );
    expect(auth.setupCode()).toBe(code);
    expect(other.setupCode()).not.toBe(code);
    // SEC-SETUP-2: missing, wrong, ambiguous (0/O/I/1) and another process's code.
    await expect(auth.createAccount(details, ip)).rejects.toBeInstanceOf(
      SetupCodeError,
    );
    await expect(
      auth.createAccount({ ...details, setupCode: wrongCode }, ip),
    ).rejects.toBeInstanceOf(SetupCodeError);
    await expect(
      auth.createAccount({ ...details, setupCode: '0' + code.slice(1) }, ip),
    ).rejects.toBeInstanceOf(SetupCodeError);
    await expect(
      auth.createAccount({ ...details, setupCode: other.setupCode()! }, ip),
    ).rejects.toBeInstanceOf(SetupCodeError);
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
    // SEC-SETUP-3: lowercase, spaces and hyphens are accepted.
    const variant = code.toLowerCase().split('-').join(' ');
    await auth.createAccount({ ...details, setupCode: variant }, ip);
    expect(p.native.prepare('SELECT count(*) AS n FROM account').get()).toEqual(
      { n: 1 },
    );
    // SEC-SETUP-7: no code once an account exists; the code is cleared from memory.
    expect(auth.setupCode()).toBeNull();
    expect(other.setupCode()).toBeNull();
  });
}, 30_000);

it('setup code: SEC-SETUP-8 the code never reaches SQLite, DATA_DIR files or service results', async () => {
  await withPersistence(async (p, root) => {
    const auth = new AuthService(p, () => now);
    const code = auth.setupCode()!;
    const bare = code.replace(/-/g, '');
    const rejected = await auth
      .createAccount({ ...details, setupCode: wrongCode }, ip)
      .catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(SetupCodeError);
    const credential = await auth.createAccount(
      { ...details, setupCode: code },
      ip,
    );
    expect(JSON.stringify(credential)).not.toContain(bare);
    expect(JSON.stringify(credential)).not.toContain(code);
    // Every file under DATA_DIR (SQLite main/WAL, keys, settings) is scanned while open.
    const names = readdirSync(root, { recursive: true }) as string[];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const path = join(root, name);
      if (!statSync(path).isFile()) continue;
      const bytes = readFileSync(path);
      expect(bytes.includes(Buffer.from(bare)), name).toBe(false);
      expect(bytes.includes(Buffer.from(code)), name).toBe(false);
    }
  });
}, 30_000);

it('setup code: 30 wrong codes from rotating IPs do not block the correct code; wrong codes hit the account and IP buckets', async () => {
  await withPersistence(async (p) => {
    const auth = new AuthService(p, () => now);
    const code = auth.setupCode()!;
    // SEC-SETUP-4: the account bucket (30) fills, the correct code still succeeds.
    for (let i = 0; i < 30; i++)
      await expect(
        auth.createAccount(
          { ...details, setupCode: wrongCode },
          `198.51.100.${i + 1}`,
        ),
      ).rejects.toBeInstanceOf(SetupCodeError);
    await expect(
      auth.createAccount({ ...details, setupCode: wrongCode }, '198.51.100.99'),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    await auth.createAccount({ ...details, setupCode: code }, ip);
    expect(p.native.prepare('SELECT count(*) AS n FROM account').get()).toEqual(
      { n: 1 },
    );
  });
  await withPersistence(async (p) => {
    // SEC-SETUP-5: one IP is limited to 10 wrong codes, then rate-limited.
    const auth = new AuthService(p, () => now);
    for (let i = 0; i < 10; i++)
      await expect(
        auth.createAccount(
          { ...details, setupCode: wrongCode },
          '198.51.100.200',
        ),
      ).rejects.toBeInstanceOf(SetupCodeError);
    await expect(
      auth.createAccount(
        { ...details, setupCode: wrongCode },
        '198.51.100.200',
      ),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    expect(p.native.prepare('SELECT * FROM account').all()).toEqual([]);
  });
}, 30_000);

it('setup code: a correct code still gets setup_closed after the window; a restart prints a new code and the old one fails', async () => {
  await withPersistence(async (p) => {
    let time = now;
    const auth = new AuthService(p, () => time, now);
    const old = auth.setupCode()!;
    time += 61 * 60_000;
    await expect(
      auth.createAccount({ ...details, setupCode: old }, ip),
    ).rejects.toMatchObject({ code: 'setup_closed' });
    const restarted = new AuthService(p, () => time);
    const fresh = restarted.setupCode()!;
    expect(fresh).not.toBe(old);
    await expect(
      restarted.createAccount({ ...details, setupCode: old }, ip),
    ).rejects.toBeInstanceOf(SetupCodeError);
    await restarted.createAccount({ ...details, setupCode: fresh }, ip);
    expect(p.native.prepare('SELECT count(*) AS n FROM account').get()).toEqual(
      { n: 1 },
    );
  });
}, 30_000);
