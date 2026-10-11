import { z } from 'zod';
import { idSchema, revisionSchema } from './domain.ts';
import {
  tagKey,
  validateTag,
  tagSpans,
  MAX_TAG_DEPTH,
  MAX_TAG_PATH_LENGTH,
  type TagSpan,
} from './markdown/tags.ts';
import {
  compareTagKeys,
  isWithinTag,
  joinTagSuffix,
  replaceTagPrefix,
  tagDepth,
  tagPathDisplays,
} from './tag-tree.ts';

/** Normalized registry key: a nested path of 1–5 non-empty segments. */
export const tagKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) =>
      [...v].length <= MAX_TAG_PATH_LENGTH &&
      tagKey(v) === v &&
      tagDepth(v) <= MAX_TAG_DEPTH &&
      !v.split('/').some((part) => !part.length) &&
      ![...v].some(
        (c) => c === '#' || c.codePointAt(0)! < 32 || c.codePointAt(0) === 127,
      ),
  );
export const tagSpellingSchema = z.string().refine((v) => {
  try {
    return [...validateTag(v)].length <= MAX_TAG_PATH_LENGTH;
  } catch {
    return false;
  }
}, 'Use 1–64 letters, numbers, marks, underscores or hyphens per level, up to 5 levels separated by /.');
export const tagAcknowledgementsSchema = z
  .array(
    z.strictObject({
      key: tagKeySchema,
      generation: revisionSchema,
    }),
  )
  .max(100)
  .refine((v) => new Set(v.map((a) => a.key)).size === v.length);
export type TagAcknowledgement = z.infer<
  typeof tagAcknowledgementsSchema
>[number];
export const tagScopeSchema = z.enum(['exact', 'subtree']);
export type TagScope = z.infer<typeof tagScopeSchema>;
/** Rename/merge always move the whole subtree; removal states its scope. */
export const tagActionSchema = z
  .strictObject({
    source: tagKeySchema,
    action: z.enum(['rename', 'merge', 'remove']),
    target: tagSpellingSchema.nullable(),
    scope: tagScopeSchema,
  })
  .refine((v) => (v.action === 'remove') === (v.target === null))
  .refine((v) => v.action === 'remove' || v.scope === 'subtree');
export type TagAction = z.infer<typeof tagActionSchema>;
export const tagExecuteSchema = z.strictObject({
  mutationId: idSchema,
  operation: tagActionSchema,
  previewToken: z.string().regex(/^[0-9a-f]{64}$/),
  confirmed: z.literal(true),
});
export type TagExecute = z.infer<typeof tagExecuteSchema>;
export interface ManagedTag {
  key: string;
  display: string;
  /** Distinct notes tagged with this node or any subtag. */
  published: number;
  trash: number;
  /** Notes with exactly this tag (0 for an implicit parent). */
  directPublished: number;
  directTrash: number;
  /** A registry row exists for this exact path. */
  explicit: boolean;
  depth: number;
  hasChildren: boolean;
}
export interface TagSummary extends ManagedTag {
  /** Number of descendant tag paths. */
  subtags: number;
}
export interface TagPreview {
  operation: TagAction;
  previewToken: string;
  counts: { published: number; trash: number };
  targetExists: boolean;
  targetRetired: boolean;
  /** Source path → resulting path for every affected registry key. */
  mappings: { from: string; to: string | null; collision: boolean }[];
  samples: {
    id: string;
    revision: number;
    status: 'published' | 'trash';
    before: string;
    after: string;
  }[];
}
export interface TagManagementResult {
  generation: number;
  affected: number;
}
export interface TagChange {
  generation: number;
  oldKey: string;
  action: 'rename' | 'merge' | 'remove';
  targetKey: string | null;
  /** `subtree` events also retire every descendant path (default `exact`). */
  scope?: TagScope;
}
export interface StaleTag {
  key: string;
  generation: number;
  /** Full resulting path, or null when the tag was removed. */
  target: string | null;
  /** Resulting prefix that replaces the first `suffixStart` source segments. */
  targetPrefix: string | null;
  suffixStart: number;
}
function eventMatches(event: TagChange, key: string): boolean {
  return event.scope === 'subtree'
    ? isWithinTag(key, event.oldKey)
    : event.oldKey === key;
}
/** Identity-changing history is sticky even after explicit recreation. Follow only
 * later events; cycles/recreated names cannot loop or erase the original warning.
 * Subtree events map descendants by replacing their prefix. */
export function staleTags(
  keys: string[],
  history: TagChange[],
  acknowledged: TagAcknowledgement[] = [],
): StaleTag[] {
  const events = history
    .filter((e) => e.oldKey !== e.targetKey)
    .sort((a, b) => a.generation - b.generation);
  return keys.flatMap((key) => {
    const first = events.findLast((e) => eventMatches(e, key));
    if (
      !first ||
      acknowledged.some(
        (a) => a.key === key && a.generation === first.generation,
      )
    )
      return [];
    // `prefix` replaces the first `consumed` segments of the original key.
    let consumed = tagDepth(first.oldKey);
    let prefix = first.targetKey;
    let generation = first.generation;
    for (const event of events) {
      if (prefix === null) break;
      const current = joinTagSuffix(prefix, key, consumed);
      if (event.generation <= generation || !eventMatches(event, current))
        continue;
      if (tagDepth(event.oldKey) <= tagDepth(prefix))
        prefix =
          event.targetKey === null
            ? null
            : replaceTagPrefix(prefix, event.oldKey, event.targetKey);
      else {
        consumed += tagDepth(event.oldKey) - tagDepth(prefix);
        prefix = event.targetKey;
      }
      generation = event.generation;
    }
    return [
      {
        key,
        generation: first.generation,
        target: prefix === null ? null : joinTagSuffix(prefix, key, consumed),
        targetPrefix: prefix,
        suffixStart: consumed,
      },
    ];
  });
}
/** Simultaneous substitutions prevent one resolved tag being rewritten twice.
 * A function replacer receives each literal span; `undefined` keeps it. */
export function rewriteTagKeys(
  source: string,
  replacements:
    Map<string, string | null> | ((span: TagSpan) => string | null | undefined),
): string {
  const replace =
    typeof replacements === 'function'
      ? replacements
      : (span: TagSpan) =>
          replacements.has(span.key) ? replacements.get(span.key)! : undefined;
  if (typeof replacements !== 'function')
    for (const value of replacements.values())
      if (value !== null) tagSpellingSchema.parse(value);
  for (const span of tagSpans(source).reverse()) {
    const value = replace(span);
    if (value === undefined) continue;
    if (value !== null) tagSpellingSchema.parse(value);
    source =
      source.slice(0, span.start) +
      (value === null ? '' : `#${value}`) +
      source.slice(span.end);
  }
  return source;
}
export interface TagSuggestion {
  key: string;
  display: string;
  /** Distinct published notes within this path (0 when unused). */
  count: number;
}
/**
 * Autocomplete inventory: registry tags plus their implicit parents, excluding any
 * path retired by history (sticky, subtree-aware), ordered by count then key.
 */
export function tagSuggestionList(
  rows: readonly { key: string; display: string }[],
  history: TagChange[],
  counts: ReadonlyMap<string, number>,
): TagSuggestion[] {
  const all = tagPathDisplays(rows);
  const retired = new Set(
    staleTags([...all.keys()], history).map((t) => t.key),
  );
  return [...all]
    .filter(([key]) => !retired.has(key))
    .map(([key, display]) => ({ key, display, count: counts.get(key) ?? 0 }))
    .sort((a, b) => b.count - a.count || compareTagKeys(a.key, b.key));
}
