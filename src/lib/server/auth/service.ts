import { statSync } from 'node:fs';
import { and, asc, count, eq, isNull, lte, ne } from 'drizzle-orm';
import { DomainError, type AccountDto } from '../../shared/domain.ts';
import {
  authTokenSchema,
  passwordSchema,
  usernameSchema,
  setupAccountSchema,
  accountDetailsSchema,
  setupPreferencesSchema,
  freshAuthScopeSchema,
  type FreshAuthScope,
  type SecurityStatusDto,
} from '../../shared/auth.ts';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import {
  account,
  sessions,
  authChallenges,
  authRateLimits,
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
import { JournalStore } from '../maintenance/journal.ts';
import { readSettings } from '../settings/repository.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import { newAuthToken, tokenHash } from './tokens.ts';
import {
  AuthRateLimiter,
  DAILY_MFA_FAILURES,
  FAILURES_SINCE_SUCCESS,
  FAILURES_SINCE_SUCCESS_WINDOW_MS,
  MFA_CHALLENGE_FAILURES,
  MFA_DAILY_FAILURES,
  RateLimitError,
} from './rate-limits.ts';
import { DeviceTrust, type DeviceToken } from './device-trust.ts';
import {
  SETUP_CODE_BUCKET,
  SetupCodeError,
  newSetupCode,
  setupCodeDigest,
  setupCodeMatches,
} from './setup-code.ts';

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
  // Trusted-device rate-limit marker for the cookie boundary; not a credential.
  device?: DeviceToken;
}
export interface PendingMfaCredential {
  token: string; // Pending challenge, NOT a session or cookie credential.
  expiresAt: number;
  mfaRequired: true;
}
export type LoginResult = SessionCredential | PendingMfaCredential;
// Result of the MFA write transaction; errors are thrown after it commits.
type MfaOutcome =
  | { kind: 'ok'; credential: SessionCredential }
  | { kind: 'limited'; retryAfterSeconds: number }
  | { kind: 'restart' }
  | { kind: 'wrong' };
type FreshAuthOutcome =
  | { kind: 'ok'; grant: { token: string; expiresAt: number } }
  | { kind: 'failed' };
const failedLogin = (): DomainError =>
  new DomainError('unauthorized', 'Invalid username or password.');
const alreadySetUp = (): DomainError =>
  new DomainError(
    'already_set_up',
    'An account already exists. Sign in to continue.',
  );
// Serialize first-account hashing across connections in this single app process.
// Ordinary password work retains its one-operation/no-queue resource bound.
let creatingAccount: Promise<SessionCredential> | undefined;
const dummyHash =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export class AuthService {
  private readonly persistence: Persistence;
  private readonly limiter: AuthRateLimiter;
  private readonly devices: DeviceTrust;
  private readonly clock: () => number;
  private readonly startedAt: number;
  // Setup code (SH2): plaintext only in memory for the startup log line; the digest
  // is what verification compares. Both are absent once an account exists.
  private setupCodePlain?: string;
  private setupCodeDigest?: string;
  constructor(persistence: Persistence, clock = Date.now, startedAt = clock()) {
    this.persistence = persistence;
    this.limiter = new AuthRateLimiter(persistence);
    this.devices = new DeviceTrust(() => persistence.keys.totpEncryptionKey);
    this.clock = clock;
    this.startedAt = startedAt;
  }
  setupState(): 'new' | 'account' | 'complete' {
    if (!this.persistence.db.select({ id: account.id }).from(account).get())
      return 'new';
    return readSettings(this.persistence).setupCompletedAt === null
      ? 'account'
      : 'complete';
  }
  setupWindowOpen(): boolean {
    return this.clock() < this.startedAt + 60 * 60_000;
  }
  assertSetupOpen(): void {
    if (this.setupState() !== 'new') throw alreadySetUp();
    if (!this.setupWindowOpen())
      throw new DomainError(
        'setup_closed',
        'Setup has timed out. Restart PandaNote on the server to open it again (docker compose restart pandanote).',
      );
  }
  // Generated lazily while no account exists and stable for this instance. A new
  // process gets a new code. Returns null once an account exists.
  setupCode(): string | null {
    if (this.setupState() !== 'new') {
      this.setupCodePlain = undefined;
      this.setupCodeDigest = undefined;
      return null;
    }
    if (this.setupCodePlain === undefined) {
      this.setupCodePlain = newSetupCode();
      this.setupCodeDigest = setupCodeDigest(this.setupCodePlain);
    }
    return this.setupCodePlain;
  }
  async createAccount(value: unknown, ip: string): Promise<SessionCredential> {
    this.assertSetupOpen();
    const now = this.clock();
    // Verify the code before any other input. A wrong or missing code is a guess and
    // counts toward the account and IP buckets. A correct code is counted only in its
    // own aggregate and code/IP buckets so even same-IP wrong-code floods cannot
    // consume the correct code's allowance.
    const supplied =
      typeof value === 'object' && value !== null
        ? (value as { setupCode?: unknown }).setupCode
        : undefined;
    if (!setupCodeMatches(this.setupCodeDigest, supplied)) {
      this.limiter.attempt('setup', ip, now);
      throw new SetupCodeError();
    }
    this.limiter.attempt('setup', ip, now, SETUP_CODE_BUCKET);
    const input = setupAccountSchema.parse(value);
    if (creatingAccount) {
      try {
        await creatingAccount;
      } catch {
        /* A failed commit permits a retry. */
      }
      this.assertSetupOpen();
    }
    const work = this.persistence.coordinator.writeAsync(async () => {
      this.assertSetupOpen();
      const passwordHash = await hashPassword(input.password);
      return this.persistence.write((tx) => {
        this.assertSetupOpen();
        const id = newPrivateId();
        tx.insert(account)
          .values({
            id,
            username: input.username,
            email: input.email,
            passwordHash,
            createdAt: this.clock(),
          })
          .run();
        return {
          ...this.createSession(tx, id, 1, this.clock()),
          device: this.devices.issue(id, 1, this.clock()),
        };
      });
    });
    creatingAccount = work;
    try {
      return await work;
    } finally {
      if (creatingAccount === work) creatingAccount = undefined;
    }
  }
  finishSetup(identity: SessionIdentity, value: unknown): void {
    const input = setupPreferencesSchema.parse(value);
    this.persistence.write((tx) => {
      this.currentIdentity(tx, identity);
      const settings = readSettings(this.persistence);
      if (settings.setupCompletedAt !== null) throw alreadySetUp();
      tx.update(appSettings)
        .set({
          valueJson: JSON.stringify({
            ...settings,
            ...input,
            setupCompletedAt: this.clock(),
          }),
          updatedAt: this.clock(),
        })
        .run();
    });
  }
  accountDetails(identity: SessionIdentity) {
    return this.persistence.write((tx) => {
      const owner = this.currentIdentity(tx, identity);
      return { username: owner.username, email: owner.email };
    });
  }
  updateAccount(identity: SessionIdentity, grant: string, value: unknown) {
    const details = accountDetailsSchema.parse(value);
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'account-update');
      const owner = this.currentIdentity(tx, identity);
      tx.update(account).set(details).where(eq(account.id, owner.id)).run();
      return details; // Sessions/security revision do not change for a username edit.
    });
  }
  async login(
    username: unknown,
    password: unknown,
    ip: string,
    deviceToken?: string,
  ): Promise<LoginResult> {
    const deviceId = this.trustedDeviceId(deviceToken);
    this.limiter.attempt('login', ip, this.clock(), deviceId);
    return this.persistence.coordinator.writeAsync(async () => {
      const snapshot = this.persistence.db.select().from(account).get();
      const parsedUsername = usernameSchema.safeParse(username);
      // Always verify the same bounded hash, even for unknown usernames. A correct
      // password with the wrong username still cannot create a challenge/session.
      const verified = await verifyPassword(
        snapshot?.passwordHash ?? dummyHash,
        password,
      );
      if (
        !snapshot ||
        !parsedUsername.success ||
        parsedUsername.data !== snapshot.username ||
        !verified
      )
        throw failedLogin();
      return this.persistence.write((tx) => {
        const current = tx.select().from(account).get();
        if (
          !current ||
          current.id !== snapshot.id ||
          current.securityRevision !== snapshot.securityRevision ||
          current.passwordHash !== snapshot.passwordHash ||
          current.username !== parsedUsername.data
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
        this.limiter.reset(tx, FAILURES_SINCE_SUCCESS);
        return {
          ...this.createSession(
            tx,
            current.id,
            current.securityRevision,
            this.clock(),
          ),
          device: this.devices.issue(
            current.id,
            current.securityRevision,
            this.clock(),
            deviceId ?? undefined,
          ),
        };
      });
    });
  }
  // Verified trusted-device id for the current account/revision, else null.
  private trustedDeviceId(token: string | undefined): string | null {
    if (!token) return null;
    const owner = this.persistence.db.select().from(account).get();
    return this.devices.verify(token, owner, this.clock());
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
        this.persistence.keys,
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
  completeMfa(
    token: string,
    code: string,
    ip: string,
    deviceToken?: string,
  ): SessionCredential {
    const deviceId = this.trustedDeviceId(deviceToken);
    this.limiter.attempt('mfa', ip, this.clock(), deviceId);
    // Failures are counted and COMMITTED in this transaction; the matching error is
    // thrown only after it returns, so a rollback can never undo a counted failure.
    const outcome = this.persistence.write((tx): MfaOutcome => {
      const now = this.clock();
      const owner = tx.select().from(account).get();
      const challenge =
        owner && this.challenge(tx, token, 'mfa', owner, null, 'login');
      if (!owner || owner.totpEnabled !== 1 || !challenge)
        return { kind: 'restart' };
      if (deviceId === null) {
        const blockedUntil = this.limiter.blockedUntil(
          tx,
          DAILY_MFA_FAILURES,
          MFA_DAILY_FAILURES.limit,
          now,
        );
        if (blockedUntil !== null)
          return {
            kind: 'limited',
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((blockedUntil - now) / 1000),
            ),
          };
      }
      if (this.consumeFactor(tx, owner, code)) {
        tx.delete(authChallenges)
          .where(eq(authChallenges.tokenHash, challenge.tokenHash))
          .run();
        this.limiter.reset(tx, FAILURES_SINCE_SUCCESS);
        return {
          kind: 'ok',
          credential: {
            ...this.createSession(tx, owner.id, owner.securityRevision, now),
            device: this.devices.issue(
              owner.id,
              owner.securityRevision,
              now,
              deviceId ?? undefined,
            ),
          },
        };
      }
      const failures = this.limiter.countFailure(
        tx,
        `mfa-challenge:${challenge.tokenHash}`,
        MFA_CHALLENGE_FAILURES.windowMs,
        now,
      );
      if (failures >= MFA_CHALLENGE_FAILURES.limit)
        tx.delete(authChallenges)
          .where(eq(authChallenges.tokenHash, challenge.tokenHash))
          .run();
      if (deviceId === null)
        this.limiter.countFailure(
          tx,
          DAILY_MFA_FAILURES,
          MFA_DAILY_FAILURES.windowMs,
          now,
        );
      this.countSinceSuccess(tx, now);
      return { kind: 'wrong' };
    });
    switch (outcome.kind) {
      case 'ok':
        return outcome.credential;
      case 'limited':
        throw new RateLimitError(
          'Too many incorrect codes today. Sign in from a device you used before, or try again tomorrow.',
          outcome.retryAfterSeconds,
        );
      case 'restart':
        throw new DomainError('mfa_restart', 'Enter your password again.');
      case 'wrong':
        throw failedLogin();
    }
  }
  // Owner notice (SH3.4): every wrong second-factor code, on either path, counts.
  private countSinceSuccess(tx: DomainTransaction, now: number): void {
    this.limiter.countFailure(
      tx,
      FAILURES_SINCE_SUCCESS,
      FAILURES_SINCE_SUCCESS_WINDOW_MS,
      now,
    );
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
      // Wrong second factors are committed before the error is thrown (see completeMfa).
      const outcome = this.persistence.write((tx): FreshAuthOutcome => {
        const owner = this.currentIdentity(tx, identity);
        if (owner.passwordHash !== snapshot.passwordHash)
          return { kind: 'failed' };
        if (
          owner.totpEnabled === 1 &&
          !this.consumeFactor(tx, owner, code ?? '')
        ) {
          this.limiter.countFailure(
            tx,
            DAILY_MFA_FAILURES,
            MFA_DAILY_FAILURES.windowMs,
            this.clock(),
          );
          this.countSinceSuccess(tx, this.clock());
          return { kind: 'failed' };
        }
        return {
          kind: 'ok',
          grant: this.createChallenge(
            tx,
            owner,
            'fresh-auth',
            scope,
            identity.sessionHash,
          ),
        };
      });
      if (outcome.kind === 'failed') throw failedLogin();
      return outcome.grant;
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
        this.persistence.keys,
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
    deviceToken?: string,
  ): SessionCredential | null {
    // Verify the request's device token against the pre-rotation revision so the
    // same device id survives the revision bump. Never issued when !keepCurrent.
    const deviceId = keepCurrent
      ? this.devices.verify(deviceToken, owner, this.clock())
      : null;
    const revision = owner.securityRevision + 1;
    tx.update(account)
      .set({ securityRevision: revision })
      .where(eq(account.id, owner.id))
      .run();
    tx.delete(authChallenges).run();
    tx.delete(sessions).run();
    return keepCurrent
      ? {
          ...this.createSession(tx, owner.id, revision, this.clock()),
          device: this.devices.issue(
            owner.id,
            revision,
            this.clock(),
            deviceId ?? undefined,
          ),
        }
      : null;
  }
  confirmEnrollment(
    identity: SessionIdentity,
    token: string,
    code: string,
    ip: string,
    deviceToken?: string,
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
      const keys = this.persistence.keys;
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
      const credential = this.rotateSecurity(tx, owner, true, deviceToken)!;
      return { codes, credential };
    });
  }
  disableMfa(identity: SessionIdentity, grant: string, deviceToken?: string) {
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'mfa-disable');
      const owner = this.currentIdentity(tx, identity);
      tx.update(account)
        .set({ totpEnabled: 0, totpSecretEncrypted: null, lastTotpStep: null })
        .where(eq(account.id, owner.id))
        .run();
      tx.delete(recoveryCodes).run();
      return this.rotateSecurity(tx, owner, true, deviceToken)!;
    });
  }
  regenerateRecoveryCodes(
    identity: SessionIdentity,
    grant: string,
    deviceToken?: string,
  ) {
    return this.persistence.write((tx) => {
      this.consumeFreshGrant(tx, identity, grant, 'recovery-regenerate');
      const owner = this.currentIdentity(tx, identity);
      if (owner.totpEnabled !== 1)
        throw new DomainError('conflict', 'Enable MFA first.');
      const codes = this.generateRecoveryCodes(tx, owner);
      return {
        codes,
        credential: this.rotateSecurity(tx, owner, true, deviceToken)!,
      };
    });
  }
  async changePassword(
    identity: SessionIdentity,
    grant: string,
    password: unknown,
    deviceToken?: string,
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
        return this.rotateSecurity(tx, owner, true, deviceToken)!;
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
    deviceToken?: string,
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
      return this.rotateSecurity(tx, owner, true, deviceToken)!;
    });
  }
  securityStatus(identity: SessionIdentity): SecurityStatusDto {
    return this.persistence.write((tx) => {
      const owner = this.currentIdentity(tx, identity);
      const now = this.clock();
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
        failedSecondFactorAttempts: this.limiter.failureCount(
          tx,
          FAILURES_SINCE_SUCCESS,
          now,
        ),
      };
    });
  }
  // Operator-only filesystem API. No web route. A second process may reset a
  // running app: IMMEDIATE serializes writes; every auth path rereads DB state.
  async resetPassword(password: unknown, signal?: AbortSignal): Promise<void> {
    passwordSchema.parse(password);
    signal?.throwIfAborted();
    const assertNoRestore = () => {
      if (
        new JournalStore(
          this.persistence.storage,
          this.persistence.coordinator,
        ).list().length
      )
        throw new DomainError(
          'busy',
          'Restore recovery is pending. Restart PandaNote before resetting the password.',
        );
    };
    assertNoRestore();
    const file = statSync(this.persistence.storage.databasePath);
    return this.persistence.coordinator.writeAsync(async () => {
      const passwordHash = await hashPassword(password);
      this.persistence.write((tx) => {
        // Recheck after prompting/hashing, under the SQLite write lock. Never
        // mutate a retained DB if a journaled replacement has begun meanwhile.
        signal?.throwIfAborted();
        assertNoRestore();
        const currentFile = statSync(this.persistence.storage.databasePath);
        if (file.dev !== currentFile.dev || file.ino !== currentFile.ino)
          throw new DomainError(
            'busy',
            'Application data changed during password reset. Run reset-password again.',
          );
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
        this.rotateSecurity(tx, owner, false);
        // Operator recovery: clear any attempt-flood lockout. Trusted-device tokens
        // are already invalidated by the security revision change.
        tx.delete(authRateLimits).run();
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
