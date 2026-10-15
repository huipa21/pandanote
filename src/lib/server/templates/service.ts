import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import {
  isBlankTemplateBody,
  normalizeTemplateBody,
  normalizeTemplateName,
  referencesAttachment,
  templateCommandSchema,
  templateNameKey,
  type NoteTemplate,
  type TemplateCommand,
  type TemplateMutationResult,
  type TemplatePage,
} from '../../shared/templates.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import type { SessionIdentity } from '../auth/service.ts';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import { noteTemplates, templateMutationReceipts } from '../db/schema.ts';
import { readSettings } from '../settings/repository.ts';

type TemplateRow = typeof noteTemplates.$inferSelect;

/** A stale update/delete. The client reloads the list and keeps its own text. */
export class TemplateConflictError extends DomainError {
  constructor() {
    super('conflict', 'err.templateChanged');
  }
}

/** Canonical content of a request. The mutation ID is the receipt key, not content. */
type Canonical =
  | { action: 'create'; name: string; nameKey: string; body: string }
  | {
      action: 'update';
      templateId: string;
      expectedRevision: number;
      name: string;
      nameKey: string;
      body: string;
    }
  | { action: 'delete'; templateId: string; expectedRevision: number };

const digest = (value: Canonical): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

function dto(row: TemplateRow): NoteTemplate {
  return {
    id: row.id,
    name: row.name,
    bodyMarkdown: row.bodyMarkdown,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Private template store. Single-user, so there is deliberately no count cap. */
export class TemplateService {
  private readonly p: Persistence;
  constructor(p: Persistence) {
    this.p = p;
  }

  list(identity: SessionIdentity): TemplatePage {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const rows = tx
        .select()
        .from(noteTemplates)
        .orderBy(asc(noteTemplates.nameKey), asc(noteTemplates.id))
        .all();
      return { items: rows.map(dto) };
    });
  }

  mutate(identity: SessionIdentity, input: unknown): TemplateMutationResult {
    const parsed = templateCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.templateRequestInvalid');
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
      let result: TemplateMutationResult;
      if (canonical.action === 'create') {
        this.assertNameFree(tx, canonical.nameKey, null);
        const id = randomUUID();
        tx.insert(noteTemplates)
          .values({
            id,
            name: canonical.name,
            nameKey: canonical.nameKey,
            bodyMarkdown: canonical.body,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        result = { templateId: id, revision: 1, deleted: false };
      } else {
        const row = this.rowFor(tx, canonical.templateId);
        if (row.revision !== canonical.expectedRevision)
          throw new TemplateConflictError();
        const guard = and(
          eq(noteTemplates.id, row.id),
          eq(noteTemplates.revision, row.revision),
        );
        if (canonical.action === 'update') {
          this.assertNameFree(tx, canonical.nameKey, row.id);
          const changed = tx
            .update(noteTemplates)
            .set({
              name: canonical.name,
              nameKey: canonical.nameKey,
              bodyMarkdown: canonical.body,
              revision: row.revision + 1,
              updatedAt: Math.max(now, row.updatedAt),
            })
            .where(guard)
            .run().changes;
          if (changed !== 1) throw new TemplateConflictError();
          result = {
            templateId: row.id,
            revision: row.revision + 1,
            deleted: false,
          };
        } else {
          const changed = tx.delete(noteTemplates).where(guard).run().changes;
          if (changed !== 1) throw new TemplateConflictError();
          result = {
            templateId: row.id,
            revision: row.revision + 1,
            deleted: true,
          };
        }
      }
      tx.insert(templateMutationReceipts)
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

  /** Validates and normalizes content exactly once; the digest is computed from this. */
  private canonicalize(command: TemplateCommand): Canonical {
    if (command.action === 'delete')
      return {
        action: 'delete',
        templateId: command.templateId,
        expectedRevision: command.expectedRevision,
      };
    const name = normalizeTemplateName(command.name);
    if (name === null)
      throw new DomainError('validation', 'err.templateNameInvalid');
    const body = normalizeTemplateBody(command.bodyMarkdown);
    if (isBlankTemplateBody(body))
      throw new DomainError('validation', 'err.templateBodyRequired');
    // Size first: the Markdown parser refuses anything over its own 1 MiB bound.
    if (Buffer.byteLength(body, 'utf8') > readSettings(this.p).markdownMaxBytes)
      throw new DomainError('validation', 'err.templateBodyTooLarge');
    if (referencesAttachment(body))
      throw new DomainError('validation', 'err.templateAttachmentReference');
    const content = { name, nameKey: templateNameKey(name), body };
    return command.action === 'create'
      ? { action: 'create', ...content }
      : {
          action: 'update',
          templateId: command.templateId,
          expectedRevision: command.expectedRevision,
          ...content,
        };
  }

  private replay(
    tx: DomainTransaction,
    identity: SessionIdentity,
    mutationId: string,
    requestDigest: string,
  ): TemplateMutationResult | null {
    const row = tx
      .select()
      .from(templateMutationReceipts)
      .where(eq(templateMutationReceipts.mutationId, mutationId))
      .get();
    if (!row) return null;
    if (
      row.accountId !== identity.account.id ||
      row.requestDigest !== requestDigest
    )
      throw new DomainError(
        'mutation-mismatch',
        'err.templateMutationMismatch',
      );
    // A retry returns the original result even after later edits or deletion.
    return JSON.parse(row.resultJson) as TemplateMutationResult;
  }

  private rowFor(tx: DomainTransaction, id: string): TemplateRow {
    const row = tx
      .select()
      .from(noteTemplates)
      .where(eq(noteTemplates.id, id))
      .get();
    if (!row) throw new DomainError('not-found', 'err.templateNotFound');
    return row;
  }

  private assertNameFree(
    tx: DomainTransaction,
    nameKey: string,
    exceptId: string | null,
  ): void {
    const clash = tx
      .select({ id: noteTemplates.id })
      .from(noteTemplates)
      .where(eq(noteTemplates.nameKey, nameKey))
      .all()
      .some((row) => row.id !== exceptId);
    if (clash) throw new DomainError('validation', 'err.templateNameExists');
  }
}
