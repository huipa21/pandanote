import { z } from 'zod';
import { idSchema, revisionSchema } from './domain.ts';
import { tagKey, validateTag, tagSpans } from './markdown/tags.ts';

export const tagKeySchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (v) =>
      [...v].length <= 64 &&
      tagKey(v) === v &&
      ![...v].some(
        (c) => c === '#' || c.codePointAt(0)! < 32 || c.codePointAt(0) === 127,
      ),
  );
export const tagSpellingSchema = z.string().refine((v) => {
  try {
    return [...validateTag(v)].length <= 64;
  } catch {
    return false;
  }
}, 'Use 1–64 letters, numbers, marks, underscores or hyphens.');
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
export const tagActionSchema = z
  .strictObject({
    source: tagKeySchema,
    action: z.enum(['rename', 'merge', 'remove']),
    target: tagSpellingSchema.nullable(),
  })
  .refine((v) => (v.action === 'remove') === (v.target === null));
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
  published: number;
  draft: number;
  trash: number;
}
export interface TagPreview {
  operation: TagAction;
  previewToken: string;
  counts: { published: number; draft: number; trash: number };
  targetExists: boolean;
  targetRetired: boolean;
  samples: {
    id: string;
    revision: number;
    status: 'published' | 'draft' | 'trash';
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
}
export interface StaleTag {
  key: string;
  generation: number;
  target: string | null;
}
/** Identity-changing history is sticky even after explicit recreation. Follow only
 * later events; cycles/recreated names cannot loop or erase the original warning. */
export function staleTags(
  keys: string[],
  history: TagChange[],
  acknowledged: TagAcknowledgement[] = [],
): StaleTag[] {
  const events = history
    .filter((e) => e.oldKey !== e.targetKey)
    .sort((a, b) => a.generation - b.generation);
  return keys.flatMap((key) => {
    const first = events.findLast((e) => e.oldKey === key);
    if (
      !first ||
      acknowledged.some(
        (a) => a.key === key && a.generation === first.generation,
      )
    )
      return [];
    let target = first.targetKey;
    let generation = first.generation;
    for (const event of events)
      if (event.generation > generation && event.oldKey === target) {
        target = event.targetKey;
        generation = event.generation;
      }
    return [{ key, generation: first.generation, target }];
  });
}
/** Simultaneous substitutions prevent one resolved tag being rewritten twice. */
export function rewriteTagKeys(
  source: string,
  replacements: Map<string, string | null>,
): string {
  for (const value of replacements.values())
    if (value !== null) tagSpellingSchema.parse(value);
  for (const span of tagSpans(source).reverse())
    if (replacements.has(span.key)) {
      const value = replacements.get(span.key)!;
      source =
        source.slice(0, span.start) +
        (value === null ? '' : `#${value}`) +
        source.slice(span.end);
    }
  return source;
}
