import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withPersistence } from '../helpers/persistence.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  AuthRateLimiter,
  DAILY_MFA_FAILURES,
  MAX_RATE_BUCKETS,
} from '../../src/lib/server/auth/rate-limits.ts';

const now = 1_800_000_000_000;
const MIN = 60_000;

it('SEC-MFA-6: failure windows are fixed, expire and never extend, and blocked only while live', async () => {
  await withPersistence(async (p) => {
    const limiter = new AuthRateLimiter(p);
    const name = 'mfa-challenge:test';
    for (let i = 1; i <= 5; i++)
      expect(
        p.write((tx) => limiter.countFailure(tx, name, 5 * MIN, now)),
      ).toBe(i);
    expect(limiter.isBlocked(p.db, name, 5, now)).toBe(true);
    // Later failures inside the window do not move its end.
    p.write((tx) => limiter.countFailure(tx, name, 5 * MIN, now + 4 * MIN));
    expect(
      p.native.prepare('SELECT expires_at AS e FROM auth_rate_limits').all(),
    ).toEqual([{ e: now + 5 * MIN }]);
    expect(limiter.isBlocked(p.db, name, 5, now + 5 * MIN - 1)).toBe(true);
    // At the window end the row is expired: not blocked, and the count restarts.
    expect(limiter.isBlocked(p.db, name, 5, now + 5 * MIN)).toBe(false);
    expect(
      p.write((tx) => limiter.countFailure(tx, name, 5 * MIN, now + 5 * MIN)),
    ).toBe(1);
    expect(limiter.isBlocked(p.db, name, 5, now + 5 * MIN)).toBe(false);
    // Unknown names are not blocked.
    expect(limiter.isBlocked(p.db, 'never-counted', 1, now)).toBe(false);
  });
});

it('SEC-MFA-6: failure counts persist across a restart and a new limiter instance', async () => {
  await withPersistence(async (p) => {
    const name = DAILY_MFA_FAILURES;
    const limiter = new AuthRateLimiter(p);
    for (let i = 0; i < 3; i++)
      p.write((tx) => limiter.countFailure(tx, name, 24 * 60 * MIN, now));
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      const again = new AuthRateLimiter(reopened);
      expect(again.isBlocked(reopened.db, name, 4, now + MIN)).toBe(false);
      expect(
        reopened.write((tx) =>
          again.countFailure(tx, name, 24 * 60 * MIN, now),
        ),
      ).toBe(4);
      expect(again.isBlocked(reopened.db, name, 4, now + MIN)).toBe(true);
    } finally {
      await reopened.close();
    }
  });
});

it('SEC-MFA-6: eviction keeps protected account buckets and evicts unprotected rows', async () => {
  await withPersistence(async (p) => {
    const limiter = new AuthRateLimiter(p);
    // Protected row with the earliest expiry, so plain expiry order would evict it.
    p.write((tx) => limiter.countFailure(tx, DAILY_MFA_FAILURES, MIN, now));
    p.native.prepare('UPDATE auth_rate_limits SET expires_at = ?').run(now + 1);
    p.write((tx) => {
      for (let i = 0; i < MAX_RATE_BUCKETS - 1; i++)
        tx.run(
          sql`INSERT INTO auth_rate_limits VALUES (${i.toString(16).padStart(64, '0')}, 1, ${now}, NULL, ${now + 3_600_000})`,
        );
    });
    expect(
      p.native.prepare('SELECT count(*) AS n FROM auth_rate_limits').get(),
    ).toEqual({ n: MAX_RATE_BUCKETS });
    p.write((tx) => limiter.countFailure(tx, 'mfa-challenge:new', MIN, now));
    expect(
      p.native.prepare('SELECT count(*) AS n FROM auth_rate_limits').get(),
    ).toEqual({ n: MAX_RATE_BUCKETS });
    // The protected daily counter survives and still has its count.
    expect(
      p.write((tx) => limiter.countFailure(tx, DAILY_MFA_FAILURES, MIN, now)),
    ).toBe(2);
    expect(
      p.native
        .prepare(
          'SELECT count(*) AS n FROM auth_rate_limits WHERE expires_at = ?',
        )
        .get(now + 3_600_000),
    ).toEqual({ n: MAX_RATE_BUCKETS - 2 });
  });
});

it('SEC-MFA-6: a counted failure rolls back with an outer transaction that throws (callers must commit first)', async () => {
  await withPersistence(async (p) => {
    const limiter = new AuthRateLimiter(p);
    expect(() =>
      p.write((tx) => {
        limiter.countFailure(tx, 'mfa-challenge:rolled', MIN, now);
        throw new Error('caller threw before commit');
      }),
    ).toThrow('caller threw before commit');
    expect(
      p.native.prepare('SELECT count(*) AS n FROM auth_rate_limits').get(),
    ).toEqual({ n: 0 });
    // The committed variant keeps the failure.
    p.write((tx) => limiter.countFailure(tx, 'mfa-challenge:rolled', MIN, now));
    expect(
      p.native.prepare('SELECT count(*) AS n FROM auth_rate_limits').get(),
    ).toEqual({ n: 1 });
  });
});
