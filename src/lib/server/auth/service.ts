import { and, asc, count, eq, isNull, lte, ne } from 'drizzle-orm';
import { DomainError, type AccountDto } from '../../shared/domain.ts';
import {
  authTokenSchema,
  passwordSchema,
  freshAuthScopeSchema,
  type FreshAuthScope,
} from '../../shared/auth.ts';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import {
  account,
  sessions,
  setupTokens,
  authChallenges,
  recoveryCodes,
  appSettings,
} from '../db/schema.ts';
import {
  encryptSecret,
  decryptSecret,
  acceptedStep,
  enrollmentMaterial,
  newRecoveryCode,
  normalizeRecoveryCode,
} from './factors.ts';
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
  mfaRequired?: false;
}
export interface PendingMfaCredential {
  token: string; // Pending challenge, NOT a session or cookie credential.
  expiresAt: number;
  mfaRequired: true;
}
export type LoginResult = SessionCredential | PendingMfaCredential;
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
  async login(password: unknown, ip: string): Promise<LoginResult> {
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
          current.passwordHash !== snapshot.passwordHash
        )
          throw failedLogin();
        if (current.totpEnabled === 1) {
          const challenge = this.createChallenge(
            tx,
            current,
            'mfa',
            'login',
            null,
          );
          return { ...challenge, mfaRequired: true as const };
        }
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
  private currentIdentity(tx: DomainTransaction, identity: SessionIdentity) {
    const owner = tx
      .select()
      .from(account)
      .where(eq(account.id, identity.account.id))
      .get();
    const session = tx
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, identity.sessionHash))
      .get();
    if (
      !owner ||
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= this.clock() ||
      session.securityRevision !== owner.securityRevision ||
      identity.securityRevision !== owner.securityRevision
    )
      throw failedLogin();
    return owner;
  }
  private createChallenge(
    tx: DomainTransaction,
    owner: typeof account.$inferSelect,
    kind: 'mfa' | 'fresh-auth' | 'enrollment',
    scope: string,
    sessionHash: string | null,
    payloadEncrypted: string | null = null,
  ) {
    const now = this.clock();
    tx.delete(authChallenges).where(lte(authChallenges.expiresAt, now)).run();
    // Replace prior grants/enrollments of this scope on this session, not other
    // sessions' work. MFA is globally bounded even under many password logins.
    if (sessionHash)
      tx.delete(authChallenges)
        .where(
          and(
            eq(authChallenges.sessionHash, sessionHash),
            eq(authChallenges.kind, kind),
            eq(authChallenges.scope, scope),
          ),
        )
        .run();
    const rows = tx
      .select()
      .from(authChallenges)
      .orderBy(asc(authChallenges.createdAt), asc(authChallenges.tokenHash))
      .all();
    for (const row of rows.slice(0, Math.max(0, rows.length - 99)))
      tx.delete(authChallenges)
        .where(eq(authChallenges.tokenHash, row.tokenHash))
        .run();
    const token = newAuthToken();
    const expiresAt = now + 5 * 60_000;
    tx.insert(authChallenges)
      .values({
        tokenHash: tokenHash('challenge', token),
        accountId: owner.id,
        kind,
        scope,
        sessionHash,
        securityRevision: owner.securityRevision,
        payloadEncrypted,
        expiresAt,
        createdAt: now,
      })
      .run();
    return { token, expiresAt };
  }
  private challenge(
    tx: DomainTransaction,
    token: string,
    kind: 'mfa' | 'fresh-auth' | 'enrollment',
    owner: typeof account.$inferSelect,
    sessionHash: string | null,
    scope: string,
  ) {
    if (!authTokenSchema.safeParse(token).success) return undefined;
    const row = tx
      .select()
      .from(authChallenges)
      .where(eq(authChallenges.tokenHash, tokenHash('challenge', token)))
      .get();
    if (
      !row ||
      row.kind !== kind ||
      row.scope !== scope ||
      row.sessionHash !== sessionHash ||
      row.accountId !== owner.id ||
      row.securityRevision !== owner.securityRevision ||
      row.expiresAt <= this.clock() ||
      row.consumedAt !== null
    )
      return undefined;
    return row;
  }
  private consumeFactor(
    tx: DomainTransaction,
    owner: typeof account.$inferSelect,
    code: string,
  ): boolean {
    if (code.length > 80) return false;
    if (/^\d{6}$/.test(code)) {
      if (!owner.totpSecretEncrypted) return false;
      const secret = decryptSecret(
        this.persistence.storage.readKeys(),
        owner.totpSecretEncrypted,
        `account:${owner.id}`,
      );
      const step = acceptedStep(secret, code, this.clock(), owner.lastTotpStep);
      if (step === null) return false;
      tx.update(account)
        .set({ lastTotpStep: step })
        .where(eq(account.id, owner.id))
        .run();
      return true;
    }
    const normalized = normalizeRecoveryCode(code);
    if (!/^[a-f0-9]{32}$/.test(normalized)) return false;
    return (
      tx
        .update(recoveryCodes)
        .set({ consumedAt: this.clock() })
        .where(
          and(
            eq(recoveryCodes.accountId, owner.id),
            eq(recoveryCodes.codeHash, tokenHash('recovery', normalized)),
            isNull(recoveryCodes.consumedAt),
          ),
        )
        .run().changes === 1
    );
  }
  completeMfa(token: string, code: string, ip: string): SessionCredential {
    this.limiter.attempt('mfa', ip, this.clock());
    return this.persistence.write((tx) => {
      const owner = tx.select().from(account).get();
      const challenge =
        owner && this.challenge(tx, token, 'mfa', owner, null, 'login');
      if (
        !owner ||
        owner.totpEnabled !== 1 ||
        !challenge ||
        !this.consumeFactor(tx, owner, code)
      )
        throw failedLogin();
      tx.delete(authChallenges)
        .where(eq(authChallenges.tokenHash, challenge.tokenHash))
        .run();
      return this.createSession(
        tx,
        owner.id,
        owner.securityRevision,
        this.clock(),
      );
    });
  }
  async freshAuth(
    identity: SessionIdentity,
    scope: FreshAuthScope,
    password: unknown,
    code: string | undefined,
    ip: string,
  ) {
    freshAuthScopeSchema.parse(scope);
    this.limiter.attempt('fresh-auth', ip, this.clock());
    return this.persistence.coordinator.writeAsync(async () => {
      const snapshot = this.persistence.write((tx) =>
        this.currentIdentity(tx, identity),
      );
      if (!(await verifyPassword(snapshot.passwordHash, password)))
        throw failedLogin();
      return this.persistence.write((tx) => {
        const owner = this.currentIdentity(tx, identity);
        if (
          owner.passwordHash !== snapshot.passwordHash ||
          (owner.totpEnabled === 1 &&
            !this.consumeFactor(tx, owner, code ?? ''))
        )
          throw failedLogin();
        return this.createChallenge(
          tx,
          owner,
          'fresh-auth',
          scope,
          identity.sessionHash,
        );
      });
    });
  }
  // Sensitive domain handlers must call this INSIDE their coordinated mutation
  // transaction. Single-use, exact scope, session + revision + expiry binding.
  consumeFreshGrant(
    tx: DomainTransaction,
    identity: SessionIdentity,
    token: string,
    scope: FreshAuthScope,
  ): void {
    const owner = this.currentIdentity(tx, identity);
    const grant = this.challenge(
      tx,
      token,
      'fresh-auth',
      owner,
      identity.sessionHash,
      scope,
    );
    if (!grant)
      throw new DomainError(
        'fresh-auth-required',
        'Authenticate again for this action.',
      );
    tx.delete(authChallenges)
      .where(eq(authChallenges.tokenHash, grant.tokenHash))
      .run();
  }
  startEnrollment(identity: SessionIdentity, grant: string) {
    const material = enrollmentMaterial();
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'mfa-enroll');
      const owner = this.currentIdentity(tx, identity);
      const encrypted = encryptSecret(
        this.persistence.storage.readKeys(),
        material.secret,
        `enrollment:${owner.id}:${identity.sessionHash}`,
      );
      const challenge = this.createChallenge(
        tx,
        owner,
        'enrollment',
        'mfa-enroll',
        identity.sessionHash,
        encrypted,
      );
      return {
        ...material,
        challenge: challenge.token,
        expiresAt: challenge.expiresAt,
      };
    });
  }
  cancelEnrollment(identity: SessionIdentity): void {
    this.persistence.write((tx) => {
      this.currentIdentity(tx, identity);
      tx.delete(authChallenges)
        .where(
          and(
            eq(authChallenges.sessionHash, identity.sessionHash),
            eq(authChallenges.kind, 'enrollment'),
          ),
        )
        .run();
    });
  }
  private generateRecoveryCodes(
    tx: DomainTransaction,
    owner: typeof account.$inferSelect,
  ): string[] {
    const codes = Array.from({ length: 10 }, newRecoveryCode);
    tx.delete(recoveryCodes).where(eq(recoveryCodes.accountId, owner.id)).run();
    for (const code of codes)
      tx.insert(recoveryCodes)
        .values({
          id: newPrivateId(),
          accountId: owner.id,
          codeHash: tokenHash('recovery', normalizeRecoveryCode(code)),
          createdAt: this.clock(),
        })
        .run();
    return codes;
  }
  private rotateSecurity(
    tx: DomainTransaction,
    owner: typeof account.$inferSelect,
    keepCurrent = true,
  ): SessionCredential | null {
    const revision = owner.securityRevision + 1;
    tx.update(account)
      .set({ securityRevision: revision })
      .where(eq(account.id, owner.id))
      .run();
    tx.delete(authChallenges).run();
    tx.delete(sessions).run();
    return keepCurrent
      ? this.createSession(tx, owner.id, revision, this.clock())
      : null;
  }
  confirmEnrollment(
    identity: SessionIdentity,
    token: string,
    code: string,
    ip: string,
  ) {
    this.limiter.attempt('enrollment', ip, this.clock());
    return this.persistence.write((tx) => {
      const owner = this.currentIdentity(tx, identity);
      const challenge = this.challenge(
        tx,
        token,
        'enrollment',
        owner,
        identity.sessionHash,
        'mfa-enroll',
      );
      if (!challenge?.payloadEncrypted) throw failedLogin();
      const keys = this.persistence.storage.readKeys();
      const secret = decryptSecret(
        keys,
        challenge.payloadEncrypted,
        `enrollment:${owner.id}:${identity.sessionHash}`,
      );
      const step = acceptedStep(secret, code, this.clock(), null);
      if (step === null) throw failedLogin();
      tx.update(account)
        .set({
          totpEnabled: 1,
          totpSecretEncrypted: encryptSecret(
            keys,
            secret,
            `account:${owner.id}`,
          ),
          lastTotpStep: step,
        })
        .where(eq(account.id, owner.id))
        .run();
      const codes = this.generateRecoveryCodes(tx, owner);
      const credential = this.rotateSecurity(tx, owner)!;
      return { codes, credential };
    });
  }
  disableMfa(identity: SessionIdentity, grant: string) {
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'mfa-disable');
      const owner = this.currentIdentity(tx, identity);
      tx.update(account)
        .set({ totpEnabled: 0, totpSecretEncrypted: null, lastTotpStep: null })
        .where(eq(account.id, owner.id))
        .run();
      tx.delete(recoveryCodes).run();
      return this.rotateSecurity(tx, owner)!;
    });
  }
  regenerateRecoveryCodes(identity: SessionIdentity, grant: string) {
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'recovery-regenerate');
      const owner = this.currentIdentity(tx, identity);
      if (owner.totpEnabled !== 1)
        throw new DomainError('conflict', 'Enable MFA first.');
      const codes = this.generateRecoveryCodes(tx, owner);
      return { codes, credential: this.rotateSecurity(tx, owner)! };
    });
  }
  async changePassword(
    identity: SessionIdentity,
    grant: string,
    password: unknown,
  ) {
    passwordSchema.parse(password);
    return this.persistence.coordinator.writeAsync(async () => {
      // Check before costly work; consume/recheck atomically after hashing.
      this.persistence.write((tx) => {
        const owner = this.currentIdentity(tx, identity);
        if (
          !this.challenge(
            tx,
            grant,
            'fresh-auth',
            owner,
            identity.sessionHash,
            'password-change',
          )
        )
          throw new DomainError(
            'fresh-auth-required',
            'Authenticate again for this action.',
          );
      });
      const passwordHash = await hashPassword(password);
      return this.persistence.write((tx) => {
        this.consumeFreshGrant(tx, identity, grant, 'password-change');
        const owner = this.currentIdentity(tx, identity);
        tx.update(account)
          .set({ passwordHash })
          .where(eq(account.id, owner.id))
          .run();
        return this.rotateSecurity(tx, owner)!;
      });
    });
  }
  revokeAll(identity: SessionIdentity, grant: string): void {
    this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'sessions-revoke');
      this.rotateSecurity(tx, this.currentIdentity(tx, identity), false);
    });
  }
  changeSessionLifetime(
    identity: SessionIdentity,
    grant: string,
    days: number,
  ) {
    if (!Number.isInteger(days) || days < 1 || days > 30)
      throw new DomainError('validation', 'Use 1–30 days.');
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'session-lifetime');
      const owner = this.currentIdentity(tx, identity);
      const settings = readSettings(this.persistence);
      tx.update(appSettings)
        .set({
          valueJson: JSON.stringify({ ...settings, sessionLifetimeDays: days }),
          updatedAt: this.clock(),
        })
        .run();
      return this.rotateSecurity(tx, owner)!;
    });
  }
  securityStatus(identity: SessionIdentity) {
    return this.persistence.write((tx) => {
      const owner = this.currentIdentity(tx, identity);
      const remaining = tx
        .select({ n: count() })
        .from(recoveryCodes)
        .where(
          and(
            eq(recoveryCodes.accountId, owner.id),
            isNull(recoveryCodes.consumedAt),
          ),
        )
        .get()!.n;
      return {
        mfaEnabled: owner.totpEnabled === 1,
        recoveryCodesRemaining: remaining,
        sessionLifetimeDays: readSettings(this.persistence).sessionLifetimeDays,
      };
    });
  }
  // Operator-only filesystem API. Never expose a route. Requires app stopped;
  // reset deliberately disables MFA, erases old factors and signs out everyone.
  async operatorRecover(password: unknown): Promise<void> {
    passwordSchema.parse(password);
    return this.persistence.coordinator.writeAsync(async () => {
      const passwordHash = await hashPassword(password);
      this.persistence.write((tx) => {
        const owner = tx.select().from(account).get();
        if (!owner) throw new DomainError('conflict', 'No account exists.');
        tx.update(account)
          .set({
            passwordHash,
            totpEnabled: 0,
            totpSecretEncrypted: null,
            lastTotpStep: null,
          })
          .run();
        tx.delete(recoveryCodes).run();
        tx.delete(setupTokens).run();
        this.rotateSecurity(tx, owner, false);
      });
    });
  }
  logout(identity: SessionIdentity): void {
    this.persistence.write((tx) => {
      tx.delete(sessions)
        .where(eq(sessions.tokenHash, identity.sessionHash))
        .run();
    });
  }
}
