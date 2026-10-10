import { z } from 'zod';
import {
  idSchema,
  instantSchema,
  locationSchema,
  revisionSchema,
} from './domain.ts';
import { MAX_MARKDOWN_LENGTH } from './markdown/parse.ts';
import { tagAcknowledgementsSchema } from './tags.ts';

export const noteContentSchema = z.strictObject({
  tagAcknowledgements: tagAcknowledgementsSchema.optional(),
  bodyMarkdown: z
    .string()
    .max(MAX_MARKDOWN_LENGTH)
    .refine(
      (value) =>
        new TextEncoder().encode(value).byteLength <= MAX_MARKDOWN_LENGTH,
      'Markdown exceeds the 1 MiB text limit',
    ),
  // null chooses the server commit instant on CREATE only. Updates/publishing
  // must submit the explicit original or deliberately changed timeline instant.
  timelineAt: instantSchema.nullable(),
  location: locationSchema.nullable(),
  attachmentIds: z
    .array(idSchema)
    .max(100)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Attachment IDs must be unique',
    ),
});
export type NoteContent = z.infer<typeof noteContentSchema>;
const identity = { mutationId: idSchema };
const existing = {
  ...identity,
  noteId: idSchema,
  expectedRevision: revisionSchema,
};
export const noteMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...identity,
    action: z.literal('create'),
    content: noteContentSchema,
  }),
  z.strictObject({
    ...existing,
    action: z.literal('update'),
    content: noteContentSchema,
  }),
  z.strictObject({ ...existing, action: z.literal('trash') }),
  z.strictObject({ ...existing, action: z.literal('restore') }),
  z.strictObject({
    ...existing,
    action: z.literal('permanent-delete'),
    confirmed: z.literal(true),
  }),
]);
export type NoteMutation = z.infer<typeof noteMutationSchema>;

/** Recovery identity includes the complete base, not just revision (restore can
 * bring back the same ID/revision with different content). Derived descriptors
 * are omitted; the ordered stable attachment IDs are authoritative. */
export function canonicalNoteSnapshot(
  note: import('./domain.ts').NoteSnapshot,
): string {
  return JSON.stringify([
    'pandanote-note-snapshot-v1',
    note.id,
    note.bodyMarkdown,
    note.status,
    note.priorStatus,
    note.timelineAt,
    note.createdAt,
    note.updatedAt,
    note.contentEditedAt,
    note.revision,
    note.location
      ? [
          note.location.latitude,
          note.location.longitude,
          note.location.accuracy,
          note.location.label,
        ]
      : null,
    note.attachmentIds,
    note.tags,
  ]);
}

/** Versioned, deterministic UTF-8 JSON to hash with SHA-256 on client and server.
 * Object key order is fixed here; attachment array order IS meaningful. No
 * caller-supplied digest is accepted by the commit endpoint. */
export function canonicalNoteMutation(value: NoteMutation): string {
  const content = 'content' in value ? value.content : null;
  return JSON.stringify([
    'pandanote-note-mutation-v1',
    value.action,
    value.action === 'create' ? null : value.noteId,
    value.action === 'create' ? null : value.expectedRevision,
    content
      ? [
          content.bodyMarkdown,
          content.timelineAt,
          content.location
            ? [
                content.location.latitude,
                content.location.longitude,
                content.location.accuracy,
                content.location.label,
              ]
            : null,
          content.attachmentIds,
          // Preserve every pre-S14 frozen digest byte-for-byte when absent.
          ...(content.tagAcknowledgements?.length
            ? [
                content.tagAcknowledgements
                  .map((a) => [a.key, a.generation])
                  .sort((a, b) =>
                    String(a[0]) < String(b[0])
                      ? -1
                      : String(a[0]) > String(b[0])
                        ? 1
                        : 0,
                  ),
              ]
            : []),
        ]
      : null,
    value.action === 'permanent-delete' ? value.confirmed : null,
  ]);
}
