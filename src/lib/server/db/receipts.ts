import { and, eq } from 'drizzle-orm';
import {
  DomainError,
  idSchema,
  mutationIdentitySchema,
  mutationResultSchema,
  type MutationResult,
} from '../../shared/domain.ts';
import type { DomainTransaction } from './connection.ts';
import { mutationReceipts } from './schema.ts';

// Call inside the SAME Persistence.write transaction as the eventual note
// mutation. Receipt results survive permanent deletion; there is no note FK.
export function findReceipt(
  tx: DomainTransaction,
  accountId: string,
  mutationId: string,
  requestDigest: string,
): MutationResult | null {
  idSchema.parse(accountId);
  mutationIdentitySchema.parse({ mutationId, requestDigest });
  const row = tx
    .select()
    .from(mutationReceipts)
    .where(
      and(
        eq(mutationReceipts.mutationId, mutationId),
        eq(mutationReceipts.accountId, accountId),
      ),
    )
    .get();
  if (!row) return null;
  if (row.requestDigest !== requestDigest)
    throw new DomainError(
      'mutation-mismatch',
      'This retry has different content. Start a new posting attempt.',
    );
  return mutationResultSchema.parse(JSON.parse(row.resultJson));
}
export function insertReceipt(
  tx: DomainTransaction,
  accountId: string,
  mutationId: string,
  requestDigest: string,
  result: MutationResult,
): void {
  idSchema.parse(accountId);
  mutationIdentitySchema.parse({ mutationId, requestDigest });
  tx.insert(mutationReceipts)
    .values({
      accountId,
      mutationId,
      requestDigest,
      resultJson: JSON.stringify(mutationResultSchema.parse(result)),
      createdAt: Date.now(),
    })
    .run();
}
