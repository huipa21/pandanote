import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DomainError } from '../../shared/domain.ts';
import { extractTags, tagKey } from '../../shared/markdown/tags.ts';
import {
  tagActionSchema,
  tagExecuteSchema,
  tagSpellingSchema,
  rewriteTagKeys,
  staleTags,
  type TagAction,
  type TagPreview,
  type ManagedTag,
  type StaleTag,
  type TagChange,
  type TagAcknowledgement,
} from '../../shared/tags.ts';
import {
  compareTagPaths,
  isWithinTag,
  joinTagSuffix,
  replaceTagPrefix,
  tagAncestors,
  tagDepth,
  tagParentKeys,
  tagPathDisplays,
  tagSubtreeUpper,
} from '../../shared/tag-tree.ts';
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
  return tx
    .select({
      generation: tagChanges.generation,
      oldKey: tagChanges.oldKey,
      action: tagChanges.action,
      targetKey: tagChanges.targetKey,
      scope: tagChanges.scope,
    })
    .from(tagChanges)
    .orderBy(tagChanges.generation)
    .all();
}
export function assertCurrentTags(
  tx: DomainTransaction,
  keys: string[],
  acknowledged: TagAcknowledgement[] = [],
): void {
  if (staleTags(keys, tagHistory(tx), acknowledged).length)
    throw new DomainError(
      'validation',
      'This note contains a retired tag. Review tag changes before posting. Your editor is unchanged.',
    );
}
type TagRow = typeof tags.$inferSelect;
/** Registry rows for `key` and every descendant path (BINARY index range). */
function subtreeRows(tx: DomainTransaction, key: string): TagRow[] {
  return tx
    .select()
    .from(tags)
    .where(
      sql`${tags.normalizedKey} = ${key} or (${tags.normalizedKey} >= ${key + '/'} and ${tags.normalizedKey} < ${tagSubtreeUpper(key)})`,
    )
    .orderBy(tags.normalizedKey)
    .all();
}
function allDisplays(tx: DomainTransaction): Map<string, string> {
  return tagPathDisplays(
    tx.all<{ key: string; display: string }>(
      sql`select normalized_key as key, display from tags`,
    ),
  );
}
interface Mapping {
  row: TagRow;
  toKey: string | null;
  toDisplay: string | null;
  collision: boolean;
}
export class TagService {
  private readonly p: Persistence;
  constructor(p: Persistence) {
    this.p = p;
  }
  /** Management inventory in tree order, including implicit parents. Counts are
   * distinct notes within each subtree; direct counts are exact-tag usage. */
  list(identity: SessionIdentity, query = ''): ManagedTag[] {
    if (query.length > 256)
      throw new DomainError('validation', 'Tag search is too long.');
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const rows = tx.all<{
        key: string;
        display: string;
        published: number;
        trash: number;
      }>(sql`select t.normalized_key as key, t.display,
        coalesce(sum(n.status='published'),0) as published,
        coalesce(sum(n.status='trash'),0) as trash from tags t left join note_tags nt on nt.tag_id=t.id
        left join notes n on n.id=nt.note_id group by t.id`);
      const parents = tagParentKeys(rows.map((row) => row.key));
      // Distinct notes per status within each parent's subtree, aggregated in memory.
      const parentSet = new Set(parents);
      const subtree = new Map<
        string,
        { published: Set<string>; trash: Set<string> }
      >();
      if (parents.length)
        for (const { note, key, status } of tx.all<{
          note: string;
          key: string;
          status: 'published' | 'trash';
        }>(sql`select nt.note_id as note, t.normalized_key as key, n.status as status
          from note_tags nt join tags t on t.id = nt.tag_id join notes n on n.id = nt.note_id`))
          for (const path of [...tagAncestors(key), key])
            if (parentSet.has(path)) {
              let sets = subtree.get(path);
              if (!sets)
                subtree.set(
                  path,
                  (sets = { published: new Set(), trash: new Set() }),
                );
              sets[status].add(note);
            }
      const direct = new Map(rows.map((row) => [row.key, row]));
      const displays = tagPathDisplays(rows);
      const needle = tagKey(query);
      const matched = new Set<string>();
      for (const key of displays.keys())
        if (key.includes(needle)) {
          matched.add(key);
          for (const ancestor of tagAncestors(key)) matched.add(ancestor);
        }
      return [...matched]
        .sort(compareTagPaths)
        .slice(0, 100)
        .map((key) => {
          const own = direct.get(key);
          const sub = subtree.get(key);
          return {
            key,
            display: displays.get(key)!,
            published: sub?.published.size ?? own?.published ?? 0,
            trash: sub?.trash.size ?? own?.trash ?? 0,
            directPublished: own?.published ?? 0,
            directTrash: own?.trash ?? 0,
            explicit: Boolean(own),
            depth: tagDepth(key),
            hasChildren: parentSet.has(key),
          };
        });
    });
  }
  check(
    identity: SessionIdentity,
    keys: string[],
    acknowledged: TagAcknowledgement[] = [],
  ): StaleTag[] {
    return this.p.db.transaction((tx) => {
      assertSessionIdentity(tx, identity);
      const stale = staleTags(keys, tagHistory(tx), acknowledged);
      if (!stale.length) return [];
      const displays = allDisplays(tx);
      return stale.map((entry) => {
        // Use the current safe source spelling, not an expanded normalized key.
        const prefix =
          entry.targetPrefix === null
            ? null
            : (displays.get(entry.targetPrefix) ?? entry.targetPrefix);
        return {
          ...entry,
          targetPrefix: prefix,
          target:
            prefix === null
              ? null
              : joinTagSuffix(prefix, entry.key, entry.suffixStart),
        };
      });
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
      throw new DomainError(
        'validation',
        'Preview and confirm a valid tag operation first.',
      );
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
            'This retry differs from the confirmed tag operation.',
          );
        return JSON.parse(receipt.resultJson) as {
          generation: number;
          affected: number;
        };
      }
      const prepared = this.prepare(tx, command.operation);
      if (prepared.preview.previewToken !== command.previewToken)
        throw new DomainError(
          'conflict',
          'Affected notes or tags changed after preview. Preview again; nothing was rewritten.',
        );
      const { source, action, scope } = command.operation;
      const caseOnly = prepared.targetKey === source;
      // Registry first: resulting paths keep the confirmed target spelling rather
      // than whichever note happens to be rewritten first.
      for (const mapping of prepared.mappings) {
        if (mapping.toKey === null) continue;
        if (caseOnly)
          tx.update(tags)
            .set({ display: mapping.toDisplay! })
            .where(eq(tags.id, mapping.row.id))
            .run();
        else
          tx.insert(tags)
            .values({
              id: randomUUID(),
              normalizedKey: mapping.toKey,
              display: mapping.toDisplay!,
            })
            .onConflictDoNothing()
            .run();
      }
      const now = Date.now();
      const limit = readSettings(this.p).markdownMaxBytes;
      for (const row of prepared.rows) {
        let body: string;
        try {
          body = prepared.rewrite(row.bodyMarkdown);
        } catch {
          throw new DomainError(
            'validation',
            'A rewritten tag would exceed the tag limits. Choose a shorter target.',
          );
        }
        if (Buffer.byteLength(body, 'utf8') > limit)
          throw new DomainError(
            'validation',
            'A rewritten note would exceed the configured text limit. Choose a shorter tag.',
          );
        let extracted: ReturnType<typeof extractTags>;
        try {
          extracted = extractTags(body);
        } catch {
          throw new DomainError(
            'validation',
            'A rewritten note would exceed the tag limits. Choose a shorter tag.',
          );
        }
        if (row.revision === Number.MAX_SAFE_INTEGER)
          throw new DomainError(
            'validation',
            'An affected note cannot accept another revision.',
          );
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
          throw new DomainError(
            'conflict',
            'An affected note changed. Preview again.',
          );
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
      if (!caseOnly) {
        const resulting = new Set(prepared.mappings.map((m) => m.toKey));
        // Retired source paths leave the registry unless they are also a result
        // (moving a subtree up can map a descendant onto the source path itself).
        for (const mapping of prepared.mappings)
          if (!resulting.has(mapping.row.normalizedKey))
            tx.run(
              sql`delete from tags where id = ${mapping.row.id} and not exists (select 1 from note_tags where tag_id = ${mapping.row.id})`,
            );
      }
      const event = tx
        .insert(tagChanges)
        .values({
          oldKey: source,
          action,
          targetKey: prepared.targetKey,
          scope,
          createdAt: now,
        })
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
      throw new DomainError(
        'validation',
        'Choose a valid source tag, scope and target spelling.',
      );
    return parsed.data;
  }
  private prepare(tx: DomainTransaction, operation: TagAction) {
    const { source, action, scope } = operation;
    const inSource = subtreeRows(tx, source);
    if (!inSource.length)
      throw new DomainError(
        'not-found',
        'The source tag no longer exists. Refresh tags.',
      );
    const sourceRows =
      scope === 'exact'
        ? inSource.filter((row) => row.normalizedKey === source)
        : inSource;
    if (!sourceRows.length)
      throw new DomainError(
        'validation',
        'No note uses this exact tag; only its subtags. Choose "This tag and all subtags".',
      );
    const displays = allDisplays(tx);
    const sourceDisplay = displays.get(source) ?? source;
    const targetKey =
      operation.target === null ? null : tagKey(operation.target);
    let targetRows: TagRow[] = [];
    let targetDisplay: string | null = null;
    if (targetKey !== null) {
      if (targetKey !== source && isWithinTag(targetKey, source))
        throw new DomainError(
          'validation',
          'A tag cannot be moved inside its own subtags.',
        );
      targetRows =
        targetKey === source
          ? []
          : subtreeRows(tx, targetKey).filter(
              (row) => !isWithinTag(row.normalizedKey, source),
            );
      if (action === 'merge' && (!targetRows.length || targetKey === source))
        throw new DomainError(
          'validation',
          'Merge requires a different existing tag.',
        );
      if (action === 'rename' && targetRows.length)
        throw new DomainError(
          'validation',
          'That tag already exists. Choose Merge and preview the combined usage.',
        );
      if (action === 'rename' && sourceDisplay === operation.target)
        throw new DomainError('validation', 'Choose a different spelling.');
      targetDisplay =
        action === 'merge'
          ? (displays.get(targetKey) ?? operation.target!)
          : operation.target!;
    }
    const depth = tagDepth(source);
    const existing = new Set(targetRows.map((row) => row.normalizedKey));
    const mappings: Mapping[] = sourceRows.map((row) => {
      if (targetKey === null || targetDisplay === null)
        return { row, toKey: null, toDisplay: null, collision: false };
      const toKey = replaceTagPrefix(row.normalizedKey, source, targetKey);
      const toDisplay = existing.has(toKey)
        ? displays.get(toKey)!
        : joinTagSuffix(targetDisplay, row.display, depth);
      if (!tagSpellingSchema.safeParse(toDisplay).success)
        throw new DomainError(
          'validation',
          `#${toDisplay} would exceed the tag limits (5 levels, 64 characters per level, 128 in total). Choose a shorter target.`,
        );
      return { row, toKey, toDisplay, collision: existing.has(toKey) };
    });
    const ids = sourceRows.map((row) => row.id);
    const size = tx.get<{
      count: number;
      bytes: number;
    }>(sql`select count(*) as count, coalesce(sum(length(cast(n.body_markdown as blob))),0) as bytes
      from notes n where n.id in (select nt.note_id from note_tags nt where nt.tag_id in (select value from json_each(${JSON.stringify(ids)})))`)!;
    // A bounded synchronous personal-scale transaction, not an unbounded main-thread job.
    if (size.count > 10000 || size.bytes > 32 * 1024 * 1024)
      throw new DomainError(
        'busy',
        'This operation exceeds the safe management limit (10,000 notes / 32 MiB). Operator assistance is required; no changes made.',
      );
    const rows = tx
      .select()
      .from(notes)
      .where(
        sql`${notes.id} in (select nt.note_id from note_tags nt where nt.tag_id in (select value from json_each(${JSON.stringify(ids)})))`,
      )
      .orderBy(notes.id)
      .all();
    const matches = (key: string) =>
      scope === 'exact' ? key === source : isWithinTag(key, source);
    const rewrite = (body: string) =>
      rewriteTagKeys(body, (span) =>
        !matches(span.key)
          ? undefined
          : targetDisplay === null
            ? null
            : joinTagSuffix(targetDisplay, span.spelling, depth),
      );
    const counts = { published: 0, trash: 0 };
    for (const row of rows) counts[row.status]++;
    const history = tagHistory(tx);
    const preview: TagPreview = {
      operation,
      counts,
      targetExists: targetRows.length > 0,
      targetRetired:
        targetKey !== null && staleTags([targetKey], history).length > 0,
      mappings: mappings.map((m) => ({
        from: m.row.display,
        to: m.toDisplay,
        collision: m.collision,
      })),
      previewToken: hash([
        operation,
        sourceRows,
        targetRows,
        history.at(-1)?.generation ?? 0,
        rows.map((r) => [r.id, r.revision, hash(r.bodyMarkdown)]),
      ]),
      samples: rows.slice(0, 10).map((r) => {
        let after: string;
        try {
          after = rewrite(r.bodyMarkdown);
        } catch {
          after = r.bodyMarkdown;
        }
        return {
          id: r.id,
          revision: r.revision,
          status: r.status,
          before: [...r.bodyMarkdown].slice(0, 240).join(''),
          after: [...after].slice(0, 240).join(''),
        };
      }),
    };
    return { preview, rows, mappings, targetKey, rewrite };
  }
}
