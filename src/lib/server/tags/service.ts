import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import { extractTags, tagKey } from '../../shared/markdown/tags.ts';
import {
  tagActionSchema,
  tagExecuteSchema,
  rewriteTagKeys,
  staleTags,
  type TagAction,
  type TagPreview,
  type ManagedTag,
  type TagChange,
  type TagAcknowledgement,
} from '../../shared/tags.ts';
import type { Persistence, DomainTransaction } from '../db/connection.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import {
  notes,
  tags,
  noteTags,
  tagChanges,
  tagMutationReceipts,
} from '../db/schema.ts';
import { refreshNoteSearch } from '../search/index.ts';
import { readSettings } from '../settings/repository.ts';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function tagHistory(tx: DomainTransaction): TagChange[] {
  return tx.select().from(tagChanges).orderBy(tagChanges.generation).all();
}
export function assertCurrentTags(
  tx: DomainTransaction,
  keys: string[],
  acknowledged: TagAcknowledgement[] = [],
): void {
  if (staleTags(keys, tagHistory(tx), acknowledged).length)
    throw new DomainError('validation', 'err.thisNoteContainsARetired');
}
export class TagService {
  private readonly p: Persistence;
  constructor(p: Persistence) {
    this.p = p;
  }
  private static needle(query: string): string {
    if (query.length > 256)
      throw new DomainError('validation', 'err.tagSearchIsTooLong');
    return tagKey(query.trim().replace(/^#/, ''));
  }
  /** Tags whose key contains `query`, ordered by key (BINARY), with note counts. */
  private matching(
    tx: DomainTransaction,
    query: string,
    limit: number,
    offset = 0,
  ): ManagedTag[] {
    return tx.all<ManagedTag>(sql`select t.normalized_key as key, t.display,
        coalesce(sum(n.status='published'),0) as published,
        coalesce(sum(n.status='trash'),0) as trash from tags t left join note_tags nt on nt.tag_id=t.id
        left join notes n on n.id=nt.note_id where instr(t.normalized_key,${TagService.needle(query)})>0
        group by t.id order by t.normalized_key limit ${limit} offset ${offset}`);
  }
  list(identity: SessionIdentity, query = ''): ManagedTag[] {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      return this.matching(tx, query, 100);
    });
  }
  /** Alphabetical page of tags whose key contains `query`. */
  page(
    identity: SessionIdentity,
    query = '',
    offset = 0,
    limit = 60,
  ): { items: ManagedTag[]; nextOffset: number | null } {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const rows = this.matching(tx, query, limit + 1, offset);
      return {
        items: rows.slice(0, limit),
        nextOffset: rows.length > limit ? offset + limit : null,
      };
    });
  }
  /** One tag's usage; null when it does not exist. */
  summary(identity: SessionIdentity, key: string): ManagedTag | null {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      return (
        tx.all<ManagedTag>(sql`select t.normalized_key as key, t.display,
        coalesce(sum(n.status='published'),0) as published,
        coalesce(sum(n.status='trash'),0) as trash from tags t left join note_tags nt on nt.tag_id=t.id
        left join notes n on n.id=nt.note_id where t.normalized_key=${key} group by t.id`)[0] ??
        null
      );
    });
  }
  check(
    identity: SessionIdentity,
    keys: string[],
    acknowledged: TagAcknowledgement[] = [],
  ) {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      return staleTags(keys, tagHistory(tx), acknowledged).map((entry) => ({
        ...entry,
        // Use the current safe source spelling, not an expanded normalized key.
        target:
          entry.target === null
            ? null
            : (tx
                .select()
                .from(tags)
                .where(eq(tags.normalizedKey, entry.target))
                .get()?.display ?? null),
      }));
    });
  }
  preview(identity: SessionIdentity, input: unknown): TagPreview {
    const operation = this.parse(input);
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      return this.prepare(tx, operation).preview;
    });
  }
  execute(identity: SessionIdentity, input: unknown) {
    const parsed = tagExecuteSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.previewAndConfirmAValid');
    const command = parsed.data,
      digest = hash(command);
    return this.p.write((tx) => {
      assertSessionIdentity(tx, identity);
      const receipt = tx
        .select()
        .from(tagMutationReceipts)
        .where(eq(tagMutationReceipts.mutationId, command.mutationId))
        .get();
      if (receipt) {
        if (
          receipt.accountId !== identity.account.id ||
          receipt.requestDigest !== digest
        )
          throw new DomainError(
            'mutation-mismatch',
            'err.thisRetryDiffersFromThe',
          );
        return JSON.parse(receipt.resultJson) as {
          generation: number;
          affected: number;
        };
      }
      const prepared = this.prepare(tx, command.operation);
      if (prepared.preview.previewToken !== command.previewToken)
        throw new DomainError('conflict', 'err.affectedNotesOrTagsChanged');
      const { source, target, action } = command.operation;
      const sourceTag = prepared.source;
      const targetKey = target === null ? null : tagKey(target);
      if (targetKey === source)
        tx.update(tags)
          .set({ display: target! })
          .where(eq(tags.id, sourceTag.id))
          .run();
      else if (target !== null && action === 'rename')
        tx.insert(tags)
          .values({
            id: randomUUID(),
            normalizedKey: targetKey!,
            display: target,
          })
          .run();
      const now = Date.now();
      for (const row of prepared.rows) {
        const body = rewriteTagKeys(
          row.bodyMarkdown,
          new Map([[source, prepared.targetDisplay]]),
        );
        if (
          Buffer.byteLength(body, 'utf8') >
          readSettings(this.p).markdownMaxBytes
        )
          throw new DomainError('validation', 'err.aRewrittenNoteWouldExceed');
        const extracted = extractTags(body);
        if (row.revision === Number.MAX_SAFE_INTEGER)
          throw new DomainError('validation', 'err.anAffectedNoteCannotAccept');
        if (
          tx
            .update(notes)
            .set({
              bodyMarkdown: body,
              revision: row.revision + 1,
              updatedAt: Math.max(now, row.updatedAt),
              contentEditedAt:
                body === row.bodyMarkdown
                  ? row.contentEditedAt
                  : Math.max(now, row.updatedAt),
            })
            .where(and(eq(notes.id, row.id), eq(notes.revision, row.revision)))
            .run().changes !== 1
        )
          throw new DomainError('conflict', 'err.anAffectedNoteChangedPreview');
        tx.delete(noteTags).where(eq(noteTags.noteId, row.id)).run();
        for (const tag of extracted) {
          tx.insert(tags)
            .values({
              id: randomUUID(),
              normalizedKey: tag.key,
              display: tag.spelling,
            })
            .onConflictDoNothing()
            .run();
          const registry = tx
            .select()
            .from(tags)
            .where(eq(tags.normalizedKey, tag.key))
            .get()!;
          tx.insert(noteTags)
            .values({ noteId: row.id, tagId: registry.id })
            .run();
        }
        refreshNoteSearch(tx, row.id);
      }
      if (targetKey !== source)
        tx.delete(tags).where(eq(tags.id, sourceTag.id)).run();
      const event = tx
        .insert(tagChanges)
        .values({ oldKey: source, action, targetKey, createdAt: now })
        .returning()
        .get();
      const result = {
        generation: event.generation,
        affected: prepared.rows.length,
      };
      tx.insert(tagMutationReceipts)
        .values({
          mutationId: command.mutationId,
          accountId: identity.account.id,
          requestDigest: digest,
          resultJson: JSON.stringify(result),
          createdAt: now,
        })
        .run();
      return result;
    });
  }
  private parse(input: unknown): TagAction {
    const parsed = tagActionSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('validation', 'err.chooseAValidSourceTag');
    return parsed.data;
  }
  private prepare(tx: DomainTransaction, operation: TagAction) {
    const source = tx
      .select()
      .from(tags)
      .where(eq(tags.normalizedKey, operation.source))
      .get();
    if (!source) throw new DomainError('not-found', 'err.theSourceTagNoLonger');
    const targetKey =
      operation.target === null ? null : tagKey(operation.target);
    const target =
      targetKey === null
        ? undefined
        : tx.select().from(tags).where(eq(tags.normalizedKey, targetKey)).get();
    if (
      operation.action === 'merge' &&
      (!target || targetKey === operation.source)
    )
      throw new DomainError(
        'validation',
        'err.mergeRequiresADifferentExisting',
      );
    if (
      operation.action === 'rename' &&
      target &&
      targetKey !== operation.source
    )
      throw new DomainError('validation', 'err.thatTagAlreadyExistsChoose');
    if (operation.action === 'rename' && source.display === operation.target)
      throw new DomainError('validation', 'err.chooseADifferentSpelling');
    const size = tx.get<{
      count: number;
      bytes: number;
    }>(sql`select count(*) as count, coalesce(sum(length(cast(n.body_markdown as blob))),0) as bytes
      from notes n join note_tags nt on nt.note_id=n.id where nt.tag_id=${source.id}`)!;
    // A bounded synchronous personal-scale transaction, not an unbounded main-thread job.
    if (size.count > 10000 || size.bytes > 32 * 1024 * 1024)
      throw new DomainError('busy', 'err.thisOperationExceedsTheSafe');
    const rows = tx
      .select({ note: notes })
      .from(notes)
      .innerJoin(noteTags, eq(noteTags.noteId, notes.id))
      .where(eq(noteTags.tagId, source.id))
      .orderBy(notes.id)
      .all()
      .map((r) => r.note);
    const targetDisplay =
      operation.action === 'merge' ? target!.display : operation.target;
    const counts = { published: 0, trash: 0 };
    for (const row of rows) counts[row.status]++;
    const history = tagHistory(tx);
    const preview: TagPreview = {
      operation,
      counts,
      targetExists: Boolean(target),
      targetRetired:
        targetKey !== null && staleTags([targetKey], history).length > 0,
      previewToken: hash([
        operation,
        source,
        target ?? null,
        history.at(-1)?.generation ?? 0,
        rows.map((r) => [r.id, r.revision, hash(r.bodyMarkdown)]),
      ]),
      samples: rows.slice(0, 10).map((r) => ({
        id: r.id,
        revision: r.revision,
        status: r.status,
        before: [...r.bodyMarkdown].slice(0, 240).join(''),
        after: [
          ...rewriteTagKeys(
            r.bodyMarkdown,
            new Map([[operation.source, targetDisplay]]),
          ),
        ]
          .slice(0, 240)
          .join(''),
      })),
    };
    return { preview, rows, source, targetDisplay };
  }
}
