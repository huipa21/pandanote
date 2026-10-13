import { eq } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import type { DomainDatabase, DomainTransaction } from '../db/connection.ts';
import { account, sessions } from '../db/schema.ts';
import type { SessionIdentity } from './service.ts';

// Recheck within each mutation transaction, not only in the request hook.
export function assertSessionIdentity(
  db: DomainDatabase | DomainTransaction,
  identity: SessionIdentity,
): void {
  const owner = db
    .select()
    .from(account)
    .where(eq(account.id, identity.account.id))
    .get();
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, identity.sessionHash))
    .get();
  if (
    !owner ||
    !session ||
    session.accountId !== owner.id ||
    session.revokedAt !== null ||
    session.expiresAt <= Date.now() ||
    owner.securityRevision !== identity.securityRevision ||
    session.securityRevision !== owner.securityRevision
  )
    throw new DomainError('unauthorized', 'err.signInAgainThenRetry');
}
