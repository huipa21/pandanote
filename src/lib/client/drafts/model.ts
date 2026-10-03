import { z } from 'zod';
import type { Nodes } from 'mdast';
import {
  idSchema,
  instantSchema,
  locationSchema,
  revisionSchema,
} from '#lib/shared/domain.ts';
import {
  parseMarkdown,
  MAX_MARKDOWN_LENGTH,
} from '#lib/shared/markdown/parse.ts';

export const attachmentSchema = z.strictObject({
  id: idSchema,
  source: z.enum(['local', 'server']),
  kind: z.enum(['image', 'file']),
  filename: z.string().max(255),
  mime: z.string().max(200),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(50 * 1024 * 1024),
});
export type DraftAttachment = z.infer<typeof attachmentSchema>;
const base = {
  schemaVersion: z.literal(1),
  accountId: idSchema,
  localDraftId: idSchema,
  revision: revisionSchema,
  createdLocallyAt: instantSchema,
  modifiedLocallyAt: instantSchema,
};
export const draftSchema = z
  .strictObject({
    ...base,
    deleted: z.literal(false),
    kind: z.enum(['new', 'edit-published', 'edit-server-draft']),
    // A server edit must be rechecked against this base snapshot before association
    // or posting (including after restore). S12/S13 supply the actual server read.
    serverBase: z
      .strictObject({
        noteId: idSchema,
        revision: revisionSchema,
        snapshotDigest: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .nullable(),
    bodyMarkdown: z
      .string()
      .max(MAX_MARKDOWN_LENGTH)
      .refine(
        (text) =>
          new TextEncoder().encode(text).byteLength <= MAX_MARKDOWN_LENGTH,
        'Markdown exceeds the 1 MiB text limit.',
      ),
    timelineAt: instantSchema,
    location: locationSchema.nullable(),
    attachments: z
      .array(attachmentSchema)
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        'Attachment identifiers must be unique.',
      ),
  })
  .refine(
    (draft) => (draft.kind === 'new') === (draft.serverBase === null),
    'Recovery edits require a server base snapshot.',
  );
export type LocalDraft = z.infer<typeof draftSchema>;
export const tombstoneSchema = z.strictObject({
  ...base,
  deleted: z.literal(true),
});
export type DraftRecord = LocalDraft | z.infer<typeof tombstoneSchema>;

export class DraftError extends Error {
  readonly code: 'storage' | 'conflict' | 'unsupported' | 'invalid';
  constructor(code: DraftError['code'], message: string) {
    super(message);
    this.code = code;
  }
}
export function decodeRecord(
  raw: string,
  accountId: string,
  id: string,
): DraftRecord {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new DraftError(
      'invalid',
      'A draft record is damaged. It has been kept, not overwritten.',
    );
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('schemaVersion' in data) ||
    data.schemaVersion !== 1
  )
    throw new DraftError(
      'unsupported',
      'A draft uses an unsupported storage version. Its data has been kept.',
    );
  // Version 1 is the first product schema. Future migrations belong here and must
  // run under the repository lock; never silently reset unknown versions.
  const result =
    'deleted' in data && data.deleted === true
      ? tombstoneSchema.safeParse(data)
      : draftSchema.safeParse(data);
  if (
    !result.success ||
    result.data.accountId !== accountId ||
    result.data.localDraftId !== id
  )
    throw new DraftError(
      'invalid',
      'A draft record is invalid. It has been kept, not overwritten.',
    );
  return result.data;
}
export function newDraft(accountId: string, now = Date.now()): LocalDraft {
  return draftSchema.parse({
    schemaVersion: 1,
    accountId,
    localDraftId: crypto.randomUUID(),
    revision: 1,
    createdLocallyAt: now,
    modifiedLocallyAt: now,
    deleted: false,
    kind: 'new',
    serverBase: null,
    bodyMarkdown: '',
    timelineAt: now,
    location: null,
    attachments: [],
  });
}
export function recoveryMatches(
  draft: LocalDraft,
  base: NonNullable<LocalDraft['serverBase']>,
): boolean {
  return (
    draft.serverBase?.noteId === base.noteId &&
    draft.serverBase.revision === base.revision &&
    draft.serverBase.snapshotDigest === base.snapshotDigest
  );
}
export function excerpt(draft: LocalDraft): string {
  const text = draft.bodyMarkdown
    .replace(/!\[[^\]]*\]\(attachment:[^)]+\)/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return text
    ? [...text].slice(0, 100).join('')
    : draft.attachments.some((a) => a.kind === 'image')
      ? 'Image note'
      : draft.attachments.length
        ? 'File attachment'
        : 'Empty draft';
}
export function hasContent(draft: LocalDraft): boolean {
  return Boolean(draft.bodyMarkdown.trim() || draft.attachments.length);
}
/** Remove only images referring to this ID, including reference-style Markdown.
 * Code/prose/unrelated formatting stays untouched. */
export function removeImageReferences(source: string, id: string): string {
  const tree = parseMarkdown(source);
  const definitions = new Map<string, string>();
  const spans: [number, number][] = [];
  function definitionsIn(node: Nodes) {
    if (node.type === 'definition') definitions.set(node.identifier, node.url);
    if ('children' in node) node.children.forEach(definitionsIn);
  }
  definitionsIn(tree);
  function visit(node: Nodes) {
    if (
      (node.type === 'image' && node.url === `attachment:${id}`) ||
      (node.type === 'imageReference' &&
        definitions.get(node.identifier) === `attachment:${id}`)
    ) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) spans.push([start, end]);
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + source.slice(end);
  return source;
}
