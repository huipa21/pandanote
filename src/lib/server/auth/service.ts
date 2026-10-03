import { and, asc, count, eq, isNull, lte, ne } from 'drizzle-orm';
import { DomainError, type AccountDto } from '../../shared/domain.ts';
import { authTokenSchema, passwordSchema } from '../../shared/auth.ts';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import { account, sessions, setupTokens } from '../db/schema.ts';
import { newPrivateId } from '../storage/private-storage.ts';
import { readSettings } from '../settings/repository.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import { newAuthToken, tokenHash } from './tokens.ts';
import { AuthRateLimiter } from './rate-limits.ts';

export interface SessionIdentity {
  account: AccountDto;
  sessionHash: string; // Server-only; never serialize this object to a page/API.
  securityRevision: number;
  expiresAt: number;
}
export interface SessionCredential {
  token: string; // Server-only; returned only to the cookie boundary.
  expiresAt: number;
}
const failedLogin = (): DomainError =>
  new DomainError('unauthorized', 'Unable to sign in. Check your credentials.');
const failedSetup = (): DomainError =>
  new DomainError(
    'unauthorized',
    'Setup is unavailable or the token is invalid or expired.',
  );

export class AuthService {
  private readonly persistence: Persistence;
  private readonly limiter: AuthRateLimiter;
  private readonly clock: () => number;
  constructor(persistence: Persistence, clock = Date.now) {
    this.persistence = persistence;
    this.limiter = new AuthRateLimiter(persistence);
    this.clock = clock;
  }
  // Operator-only API: do not expose issuance as a public web action. Reissue
  // replaces the sole pending token. No account, password or demo content seed.
  issueSetupToken(): string {
    const token = newAuthToken();
    const now = this.clock();
    this.persistence.write((tx) => {
      if (tx.select({ id: account.id }).from(account).get())
        throw new DomainError('conflict', 'An account already exists.');
      tx.insert(setupTokens)
        .values({
          singleton: 1,
          tokenHash: tokenHash('setup', token),
          createdAt: now,
          expiresAt: now + 60 * 60_000,
        })
        .onConflictDoUpdate({
          target: setupTokens.singleton,
          set: {
            tokenHash: tokenHash('setup', token),
            createdAt: now,
            expiresAt: now + 60 * 60_000,
          },
        })
        .run();
    });
    return token;
  }
  private validSetup(
    tx: DomainTransaction,
    token: string,
    now: number,
  ): boolean {
    const pending = tx
      .select()
      .from(setupTokens)
      .where(
        and(
          eq(setupTokens.singleton, 1),
          eq(setupTokens.tokenHash, tokenHash('setup', token)),
        ),
      )
      .get();
    return (
      !tx.select({ id: account.id }).from(account).get() &&
      pending !== undefined &&
      pending.expiresAt > now
    );
  }
  async setup(
    token: string,
    password: unknown,
    ip: string,
  ): Promise<SessionCredential> {
    this.limiter.attempt('setup', ip, this.clock());
    if (!authTokenSchema.safeParse(token).success) throw failedSetup();
    // Refuse unheld tokens before any expensive password work. Recheck expiry,
    // sole-account state and token identity inside the eventual commit.
    if (
      !this.persistence.write((tx) => this.validSetup(tx, token, this.clock()))
    )
      throw failedSetup();
    passwordSchema.parse(password);
    return this.persistence.coordinator.writeAsync(async () => {
      const passwordHash = await hashPassword(password);
      return this.persistence.write((tx) => {
        const now = this.clock();
        if (!this.validSetup(tx, token, now)) throw failedSetup();
        const id = newPrivateId();
        tx.insert(account).values({ id, passwordHash, createdAt: now }).run();
        tx.delete(setupTokens).run(); // Atomically consumed with account + session.
        return this.createSession(tx, id, 1, now);
      });
    });
  }
  async login(password: unknown, ip: string): Promise<SessionCredential> {
    this.limiter.attempt('login', ip, this.clock());
    return this.persistence.coordinator.writeAsync(async () => {
      const snapshot = this.persistence.db.select().from(account).get();
      if (!snapshot || !(await verifyPassword(snapshot.passwordHash, password)))
        throw failedLogin();
      return this.persistence.write((tx) => {
        const current = tx.select().from(account).get();
        if (
          !current ||
          current.id !== snapshot.id ||
          current.securityRevision !== snapshot.securityRevision ||
          current.passwordHash !== snapshot.passwordHash ||
          current.totpEnabled !== 0
        )
          // MFA completion is the next S02 slice. Until then an enabled MFA
          // account MUST fail closed; never turn password success into access.
          throw failedLogin();
        return this.createSession(
          tx,
          current.id,
          current.securityRevision,
          this.clock(),
        );
      });
    });
  }
  private createSession(
    tx: DomainTransaction,
    accountId: string,
    revision: number,
    now: number,
  ): SessionCredential {
    const token = newAuthToken();
    const expiresAt =
      now + readSettings(this.persistence).sessionLifetimeDays * 86_400_000;
    tx.delete(sessions).where(lte(sessions.expiresAt, now)).run();
    tx.insert(sessions)
      .values({
        tokenHash: tokenHash('session', token),
        accountId,
        securityRevision: revision,
        createdAt: now,
        expiresAt,
      })
      .run();
    // Single-user bound: keep at most 100 sessions, evicting the oldest. No
    // unlimited table growth from repeated successful logins; no rolling expiry.
    const total = tx.select({ n: count() }).from(sessions).get()!.n;
    if (total > 100) {
      const oldest = tx
        .select({ hash: sessions.tokenHash })
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            ne(sessions.tokenHash, tokenHash('session', token)),
          ),
        )
        .orderBy(asc(sessions.createdAt), asc(sessions.tokenHash))
        .limit(total - 100)
        .all();
      for (const row of oldest)
        tx.delete(sessions).where(eq(sessions.tokenHash, row.hash)).run();
    }
    return { token, expiresAt };
  }
  authenticate(token: string | undefined): SessionIdentity | null {
    if (!authTokenSchema.safeParse(token).success) return null;
    const hash = tokenHash('session', token!);
    const row = this.persistence.db
      .select({ session: sessions, owner: account })
      .from(sessions)
      .innerJoin(account, eq(account.id, sessions.accountId))
      .where(and(eq(sessions.tokenHash, hash), isNull(sessions.revokedAt)))
      .get();
    if (
      !row ||
      row.session.expiresAt <= this.clock() ||
      row.session.securityRevision !== row.owner.securityRevision
    )
      return null;
    return {
      account: { id: row.owner.id, mfaEnabled: row.owner.totpEnabled === 1 },
      sessionHash: hash,
      securityRevision: row.owner.securityRevision,
      expiresAt: row.session.expiresAt,
    };
  }
  logout(identity: SessionIdentity): void {
    this.persistence.write((tx) => {
      tx.delete(sessions)
        .where(eq(sessions.tokenHash, identity.sessionHash))
        .run();
    });
  }
}
