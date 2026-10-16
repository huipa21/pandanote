import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import {
  labelCommandSchema,
  labelNameKey,
  MAX_LABELS,
  normalizeLabelName,
  type LabelCommand,
  type LabelMutationResult,
  type LabelPage,
  type LabelSummary,
  type NoteLabel,
} from '../../shared/labels.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import type { SessionIdentity } from '../auth/service.ts';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import { labelMutationReceipts, labels, notes } from '../db/schema.ts';

type LabelRow = typeof labels.$inferSelect;

/** A stale update/delete. The client reloads the list and keeps its own text. */
export class LabelConflictError extends DomainError {
  constructor() {
    super('conflict', 'err.labelChanged');
  }
}

type Canonical =
  | {
      action: 'create';
      name: string;
      nameKey: string;
      color: string;
      icon: string | null;
      headerColor: string | null;
      background: string | null;
      font: string | null;
    }
  | {
      action: 'update';
      labelId: string;
      expectedRevision: number;
      name: string;
      nameKey: string;
      color: string;
      icon: string | null;
      headerColor: string | null;
      background: string | null;
      font: string | null;
    }
  | { action: 'delete'; labelId: string; expectedRevision: number };

const digest = (value: Canonical): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

function dto(row: LabelRow): NoteLabel {
  return {
    id: row.id,
    name: row.name,
    color: row.color as NoteLabel['color'],
    icon: row.icon as NoteLabel['icon'],
    headerColor: row.headerColor as NoteLabel['headerColor'],
    background: row.background as NoteLabel['background'],
    font: row.font as NoteLabel['font'],
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Private label store. Single-user; at most MAX_LABELS rows. */
export class LabelService {
  private readonly p: Persistence;
  constructor(p: Persistence) {
    this.p = p;
  }

  list(identity: SessionIdentity): LabelPage {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const rows = tx
        .select()
        .from(labels)
        .orderBy(asc(labels.nameKey), asc(labels.id))
        .all();
      const counts = tx
        .select({
          labelId: notes.labelId,
          count: sql<number>`count(*)`,
        })
        .from(notes)
        .where(
          and(eq(notes.status, 'published'), sql`${notes.labelId} IS NOT NULL`),
        )
        .groupBy(notes.labelId)
        .all();
      const items: LabelSummary[] = rows.map((row) => ({
        ...dto(row),
        noteCount: counts.find((c) => c.labelId === row.id)?.count ?? 0,
      }));
      return { items };
    });
  }

  mutate(identity: SessionIdentity, input: unknown): LabelMutationResult {
    const parsed = labelCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.labelRequestInvalid');
    const command = parsed.data;
    const canonical = this.canonicalize(command);
    const requestDigest = digest(canonical);
    return this.p.write((tx) => {
      assertSessionIdentity(tx, identity);
      const replay = this.replay(
        tx,
        identity,
        command.mutationId,
        requestDigest,
      );
      if (replay) return replay;
      const now = Date.now();
      let result: LabelMutationResult;
      if (canonical.action === 'create') {
        this.assertCap(tx);
        this.assertNameFree(tx, canonical.nameKey, null);
        const id = randomUUID();
        tx.insert(labels)
          .values({
            id,
            name: canonical.name,
            nameKey: canonical.nameKey,
            color: canonical.color,
            icon: canonical.icon,
            headerColor: canonical.headerColor,
            background: canonical.background,
            font: canonical.font,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        result = { labelId: id, revision: 1, deleted: false };
      } else {
        const row = this.rowFor(tx, canonical.labelId);
        if (row.revision !== canonical.expectedRevision)
          throw new LabelConflictError();
        const guard = and(
          eq(labels.id, row.id),
          eq(labels.revision, row.revision),
        );
        if (canonical.action === 'update') {
          this.assertNameFree(tx, canonical.nameKey, row.id);
          const changed = tx
            .update(labels)
            .set({
              name: canonical.name,
              nameKey: canonical.nameKey,
              color: canonical.color,
              icon: canonical.icon,
              headerColor: canonical.headerColor,
              background: canonical.background,
              font: canonical.font,
              revision: row.revision + 1,
              updatedAt: Math.max(now, row.updatedAt),
            })
            .where(guard)
            .run().changes;
          if (changed !== 1) throw new LabelConflictError();
          result = {
            labelId: row.id,
            revision: row.revision + 1,
            deleted: false,
          };
        } else {
          // ON DELETE SET NULL clears label_id on every note that had it, in
          // this same transaction. No note is ever deleted.
          const changed = tx.delete(labels).where(guard).run().changes;
          if (changed !== 1) throw new LabelConflictError();
          result = {
            labelId: row.id,
            revision: row.revision + 1,
            deleted: true,
          };
        }
      }
      tx.insert(labelMutationReceipts)
        .values({
          mutationId: command.mutationId,
          accountId: identity.account.id,
          requestDigest,
          resultJson: JSON.stringify(result),
          createdAt: now,
        })
        .run();
      return result;
    });
  }

  private canonicalize(command: LabelCommand): Canonical {
    if (command.action === 'delete')
      return {
        action: 'delete',
        labelId: command.labelId,
        expectedRevision: command.expectedRevision,
      };
    const name = normalizeLabelName(command.name);
    if (name === null)
      throw new DomainError('validation', 'err.labelNameInvalid');
    const content = {
      name,
      nameKey: labelNameKey(name),
      color: command.color,
      icon: command.icon,
      headerColor: command.headerColor,
      background: command.background,
      font: command.font,
    };
    return command.action === 'create'
      ? { action: 'create', ...content }
      : {
          action: 'update',
          labelId: command.labelId,
          expectedRevision: command.expectedRevision,
          ...content,
        };
  }

  private replay(
    tx: DomainTransaction,
    identity: SessionIdentity,
    mutationId: string,
    requestDigest: string,
  ): LabelMutationResult | null {
    const row = tx
      .select()
      .from(labelMutationReceipts)
      .where(eq(labelMutationReceipts.mutationId, mutationId))
      .get();
    if (!row) return null;
    if (
      row.accountId !== identity.account.id ||
      row.requestDigest !== requestDigest
    )
      throw new DomainError('mutation-mismatch', 'err.labelMutationMismatch');
    return JSON.parse(row.resultJson) as LabelMutationResult;
  }

  private rowFor(tx: DomainTransaction, id: string): LabelRow {
    const row = tx.select().from(labels).where(eq(labels.id, id)).get();
    if (!row) throw new DomainError('not-found', 'err.labelNotFound');
    return row;
  }

  private assertCap(tx: DomainTransaction): void {
    const n = tx
      .select({ n: sql<number>`count(*)` })
      .from(labels)
      .get()!.n;
    if (n >= MAX_LABELS)
      throw new DomainError('validation', 'err.labelLimitReached', {
        params: { max: MAX_LABELS },
      });
  }

  private assertNameFree(
    tx: DomainTransaction,
    nameKey: string,
    exceptId: string | null,
  ): void {
    const clash = tx
      .select({ id: labels.id })
      .from(labels)
      .where(eq(labels.nameKey, nameKey))
      .all()
      .some((row) => row.id !== exceptId);
    if (clash) throw new DomainError('validation', 'err.labelNameExists');
  }
}

/** Validates a label reference exists. Called from note content writes; a missing
 * or deleted label is reported the same way as any other invalid reference. */
export function assertLabelExists(
  tx: DomainTransaction,
  labelId: string,
): void {
  const row = tx
    .select({ id: labels.id })
    .from(labels)
    .where(eq(labels.id, labelId))
    .get();
  if (!row) throw new DomainError('not-found', 'err.labelNotFound');
}
