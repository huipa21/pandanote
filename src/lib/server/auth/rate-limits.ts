import { createHmac } from 'node:crypto';
import { asc, count, eq, lte, notInArray } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import type { Persistence } from '../db/connection.ts';
import { authRateLimits } from '../db/schema.ts';

const WINDOW_MS = 15 * 60_000;
export const MAX_RATE_BUCKETS = 1024;
export type CredentialAction =
  'setup' | 'login' | 'mfa' | 'fresh-auth' | 'enrollment';
const actions: CredentialAction[] = [
  'setup',
  'login',
  'mfa',
  'fresh-auth',
  'enrollment',
];

export class AuthRateLimiter {
  private readonly persistence: Persistence;
  private readonly key: Buffer;
  constructor(persistence: Persistence) {
    this.persistence = persistence;
    this.key = Buffer.from(
      persistence.storage.readKeys().totpEncryptionKey,
      'base64',
    );
  }
  // `deviceId` must come from a verified trusted-device token. Such a caller is
  // counted against its own device bucket instead of the shared account-wide one,
  // so anonymous attempts cannot exhaust the owner's allowance. The IP bucket
  // always applies.
  attempt(
    action: CredentialAction,
    ip: string,
    now: number,
    deviceId: string | null = null,
  ): void {
    const digest = (value: string): string =>
      createHmac('sha256', this.key)
        .update(`auth-rate-v1\0${value}`)
        .digest('hex');
    const buckets = [
      deviceId
        ? { key: digest(`${action}:device:${deviceId}`), limit: 30 }
        : { key: digest(`${action}:account`), limit: 30 },
      { key: digest(`${action}:ip:${ip}`), limit: 10 },
    ];
    // Denials commit too. Never throw inside the transaction and roll back an
    // attempt. A blocked caller cannot prolong an existing fixed window.
    const allowed = this.persistence.write((tx) => {
      tx.delete(authRateLimits).where(lte(authRateLimits.expiresAt, now)).run();
      const rows = buckets.map(({ key }) =>
        tx
          .select()
          .from(authRateLimits)
          .where(eq(authRateLimits.keyHash, key))
          .get(),
      );
      if (rows.some((row, i) => row && row.attempts >= buckets[i].limit))
        return false;
      const total = tx.select({ n: count() }).from(authRateLimits).get()!.n;
      const missing = rows.filter((row) => !row).length;
      // Evict earliest IP buckets only under high-cardinality abuse. Account
      // limits still bound expensive work even if IPs rotate/are evicted.
      if (total + missing > MAX_RATE_BUCKETS) {
        const needed = total + missing - MAX_RATE_BUCKETS;
        const protectedKeys = [
          ...actions.map((action) => digest(`${action}:account`)),
          ...buckets.map((b) => b.key),
        ];
        const victims = tx
          .select({ key: authRateLimits.keyHash })
          .from(authRateLimits)
          .where(notInArray(authRateLimits.keyHash, protectedKeys))
          .orderBy(asc(authRateLimits.expiresAt))
          .limit(needed)
          .all();
        if (victims.length !== needed) return false;
        for (const victim of victims)
          tx.delete(authRateLimits)
            .where(eq(authRateLimits.keyHash, victim.key))
            .run();
      }
      for (const [i, bucket] of buckets.entries()) {
        const previous = rows[i];
        tx.insert(authRateLimits)
          .values({
            keyHash: bucket.key,
            attempts: (previous?.attempts ?? 0) + 1,
            windowStartedAt: previous?.windowStartedAt ?? now,
            blockedUntil: null,
            expiresAt: previous?.expiresAt ?? now + WINDOW_MS,
          })
          .onConflictDoUpdate({
            target: authRateLimits.keyHash,
            set: { attempts: (previous?.attempts ?? 0) + 1 },
          })
          .run();
      }
      return true;
    });
    if (!allowed)
      throw new DomainError(
        'rate-limited',
        'Too many attempts. Try again in 15 minutes.',
      );
  }
}
