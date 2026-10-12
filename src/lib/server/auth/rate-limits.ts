import { createHmac } from 'node:crypto';
import { asc, count, eq, lte, notInArray } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import type {
  DomainDatabase,
  DomainTransaction,
  Persistence,
} from '../db/connection.ts';
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
/** Account-wide daily count of wrong second-factor codes (SH3.2 writes it). */
export const DAILY_MFA_FAILURES = 'mfa-failures-day:account';
/** Wrong codes allowed per MFA challenge; the challenge is deleted at the limit. */
export const MFA_CHALLENGE_FAILURES = {
  limit: 5,
  windowMs: 5 * 60_000,
} as const;
/** Wrong second-factor codes per account per day on the untrusted path. */
export const MFA_DAILY_FAILURES = {
  limit: 30,
  windowMs: 24 * 60 * 60_000,
} as const;
// Per-action attempt limits (fixed 15-minute windows). `device` applies to callers
// holding a verified trusted-device token instead of `account`; `ip` always applies.
interface AttemptLimits {
  account: number;
  device: number;
  ip: number;
}
const defaultLimits: AttemptLimits = { account: 30, device: 30, ip: 10 };
const actionLimits: Record<CredentialAction, AttemptLimits> = {
  setup: defaultLimits,
  login: defaultLimits,
  mfa: { ...defaultLimits, account: 10 },
  'fresh-auth': defaultLimits,
  enrollment: defaultLimits,
};
/** A rate-limited error that tells the caller how long to wait (seconds). */
export class RateLimitError extends DomainError {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super('rate-limited', message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
// Account-wide buckets are never evicted: they bound expensive work and
// account-level lockouts even when IP buckets rotate or are evicted.
const protectedNames = [
  ...actions.map((action) => `${action}:account`),
  DAILY_MFA_FAILURES,
];
type Reader = Pick<DomainDatabase, 'select'>;

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
  private digest(value: string): string {
    return createHmac('sha256', this.key)
      .update(`auth-rate-v1\0${value}`)
      .digest('hex');
  }
  // Evicts the earliest-expiring unprotected rows so `incoming` new rows fit.
  // Returns false (and deletes nothing) when not enough unprotected rows exist.
  private makeRoom(
    tx: DomainTransaction,
    incoming: number,
    keep: string[],
  ): boolean {
    const total = tx.select({ n: count() }).from(authRateLimits).get()!.n;
    if (total + incoming <= MAX_RATE_BUCKETS) return true;
    const needed = total + incoming - MAX_RATE_BUCKETS;
    const protectedKeys = [
      ...protectedNames.map((n) => this.digest(n)),
      ...keep,
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
    return true;
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
    const digest = (value: string): string => this.digest(value);
    const limits = actionLimits[action];
    const buckets = [
      deviceId
        ? { key: digest(`${action}:device:${deviceId}`), limit: limits.device }
        : { key: digest(`${action}:account`), limit: limits.account },
      { key: digest(`${action}:ip:${ip}`), limit: limits.ip },
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
      const missing = rows.filter((row) => !row).length;
      if (
        !this.makeRoom(
          tx,
          missing,
          buckets.map((b) => b.key),
        )
      )
        return false;
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
      throw new RateLimitError(
        'Too many attempts. Try again in 15 minutes.',
        WINDOW_MS / 1000,
      );
  }
  /**
   * Counts one failure in the fixed window `name` and returns the new count.
   * A window starts at its first failure and ends `windowMs` later; later
   * failures never extend it. Call inside the caller's write transaction and
   * COMMIT before throwing: a rolled-back transaction also rolls the failure back.
   */
  countFailure(
    tx: DomainTransaction,
    name: string,
    windowMs: number,
    now: number,
  ): number {
    const key = this.digest(name);
    tx.delete(authRateLimits).where(lte(authRateLimits.expiresAt, now)).run();
    const row = tx
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.keyHash, key))
      .get();
    if (row) {
      // Live rows only: expired windows were purged above.
      const attempts = row.attempts + 1;
      tx.update(authRateLimits)
        .set({ attempts })
        .where(eq(authRateLimits.keyHash, key))
        .run();
      return attempts;
    }
    // A failure is always recorded. If eviction cannot make room (only possible
    // if almost every row is protected), the table exceeds the cap by one row.
    this.makeRoom(tx, 1, [key]);
    tx.insert(authRateLimits)
      .values({
        keyHash: key,
        attempts: 1,
        windowStartedAt: now,
        blockedUntil: null,
        expiresAt: now + windowMs,
      })
      .run();
    return 1;
  }
  /** Epoch ms when the live window `name` ends, if it has reached `limit`; else null. */
  blockedUntil(
    db: Reader,
    name: string,
    limit: number,
    now: number,
  ): number | null {
    const row = db
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.keyHash, this.digest(name)))
      .get();
    return row && row.expiresAt > now && row.attempts >= limit
      ? row.expiresAt
      : null;
  }
  /** True while the fixed window `name` is live and has reached `limit`. */
  isBlocked(db: Reader, name: string, limit: number, now: number): boolean {
    return this.blockedUntil(db, name, limit, now) !== null;
  }
}
