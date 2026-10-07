import { z } from 'zod';

// UTC epoch milliseconds, never a local wall-clock string or SQLite seconds.
export const instantSchema = z.number().int().min(0).max(8_640_000_000_000_000);
export const idSchema = z.uuidv4().regex(/^[0-9a-f-]+$/);
export const revisionSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);
export const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const noteStatusSchema = z.enum(['published', 'draft', 'trash']);
export type NoteStatus = z.infer<typeof noteStatusSchema>;
export type RestorableStatus = Exclude<NoteStatus, 'trash'>;

export const locationSchema = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).nullable(),
  label: z.string().max(200).nullable(),
});
export type NoteLocation = z.infer<typeof locationSchema>;

export const noteMetadataSchema = z
  .strictObject({
    id: idSchema,
    status: noteStatusSchema,
    priorStatus: z.enum(['published', 'draft']).nullable(),
    timelineAt: instantSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
    contentEditedAt: instantSchema.nullable(),
    revision: revisionSchema,
    location: locationSchema.nullable(),
  })
  .refine((note) => (note.status === 'trash') === (note.priorStatus !== null), {
    message: 'Only Trash notes must retain a prior status',
  })
  .refine(
    (note) =>
      note.updatedAt >= note.createdAt &&
      (note.contentEditedAt === null ||
        (note.contentEditedAt >= note.createdAt &&
          note.contentEditedAt <= note.updatedAt)),
    {
      message: 'Modification times must be consistent with creation time',
    },
  );
export type NoteMetadata = z.infer<typeof noteMetadataSchema>;
export interface NoteSnapshot extends NoteMetadata {
  bodyMarkdown: string;
  attachmentIds: string[];
  // Optional for older recovery snapshots; current server reads include safe,
  // ordered descriptors so processed media and download rows use detected kind.
  attachments?: import('./attachments.ts').ReadyAttachment[];
  tags: string[];
}
// Intentionally no account/security fields in browser contracts.
export interface AccountDto {
  id: string;
  mfaEnabled: boolean;
}
export const mutationIdentitySchema = z.strictObject({
  mutationId: idSchema,
  requestDigest: digestSchema,
});
export const mutationResultSchema = z.strictObject({
  noteId: idSchema,
  revision: revisionSchema,
  status: noteStatusSchema,
  deleted: z.boolean(),
});
export type MutationResult = z.infer<typeof mutationResultSchema>;
export const expectedRevisionSchema = revisionSchema;

export type ErrorCode =
  | 'validation'
  | 'setup_required'
  | 'already_set_up'
  | 'setup_closed'
  | 'unauthorized'
  | 'rate-limited'
  | 'fresh-auth-required'
  | 'conflict'
  | 'mutation-mismatch'
  | 'storage-full'
  | 'upload-failed'
  | 'busy'
  | 'invalid-backup'
  | 'not-found';
export interface ApiError {
  code: ErrorCode;
  message: string;
  conflict?: NoteSnapshot;
}
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

export class DomainError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'DomainError';
  }
}

export function assertRevision(actual: number, expected: number): void {
  expectedRevisionSchema.parse(expected);
  if (actual !== expected)
    throw new DomainError(
      'conflict',
      'The note has changed. Keep your local edits and reload the server version.',
    );
}

export type NoteAction = 'move-to-draft' | 'publish' | 'trash' | 'restore';
export function transitionNote(
  status: NoteStatus,
  priorStatus: RestorableStatus | null,
  action: NoteAction,
): { status: NoteStatus; priorStatus: RestorableStatus | null } {
  if ((status === 'trash') !== (priorStatus !== null))
    throw new DomainError('validation', 'Invalid note state.');
  if (action === 'trash' && status !== 'trash')
    return { status: 'trash', priorStatus: status };
  if (action === 'restore' && status === 'trash' && priorStatus)
    return { status: priorStatus, priorStatus: null };
  if (action === 'move-to-draft' && status === 'published')
    return { status: 'draft', priorStatus: null };
  if (action === 'publish' && status === 'draft')
    return { status: 'published', priorStatus: null };
  throw new DomainError('validation', 'This note cannot make that transition.');
}

export function validateTimelineAt(value: unknown, now: number): number {
  const instant = instantSchema.parse(value);
  if (instant > instantSchema.parse(now))
    throw new DomainError(
      'validation',
      'Timeline date must be now or earlier.',
    );
  return instant;
}
