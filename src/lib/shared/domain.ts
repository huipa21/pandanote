import { z } from 'zod';
import {
  translate,
  type MessageKey,
  type MessageParams,
} from './i18n/index.ts';

// UTC epoch milliseconds, never a local wall-clock string or SQLite seconds.
export const instantSchema = z.number().int().min(0).max(8_640_000_000_000_000);
export const idSchema = z.uuidv4().regex(/^[0-9a-f-]+$/);
export const revisionSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);
export const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const noteStatusSchema = z.enum(['published', 'trash']);
export type NoteStatus = z.infer<typeof noteStatusSchema>;
export type RestorableStatus = 'published';

export const noteMetadataSchema = z
  .strictObject({
    id: idSchema,
    isPrivate: z.boolean().optional(),
    status: noteStatusSchema,
    priorStatus: z.enum(['published']).nullable(),
    timelineAt: instantSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
    contentEditedAt: instantSchema.nullable(),
    revision: revisionSchema,
    // UTC ms when pinned to the top of the plain timeline; Trash notes are never pinned.
    pinnedAt: instantSchema.nullable(),
  })
  .refine((note) => (note.status === 'trash') === (note.priorStatus !== null), {
    message: 'Only Trash notes must retain a prior status',
  })
  .refine((note) => note.status === 'published' || note.pinnedAt === null, {
    message: 'Only published notes can be pinned',
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
  // Full server reads include safe ordered descriptors. Bounded timeline payloads
  // may omit them; the editor verifies complete metadata before accepting a base.
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
  | 'mfa_restart'
  | 'conflict'
  | 'mutation-mismatch'
  | 'storage-full'
  | 'upload-failed'
  | 'busy'
  | 'invalid-backup'
  | 'not-found';
export type ErrorText = import('./i18n/index.ts').ErrorText;
export interface ApiError {
  code: ErrorCode;
  /** English text for API consumers and logs. Never displayed verbatim in a non-English UI. */
  message: string;
  /** Stable catalog key for the message; the client localizes it. */
  messageKey?: MessageKey;
  messageParams?: MessageParams;
  conflict?: NoteSnapshot;
}
/** Body of an API error with a stable message key and its English text. */
export function apiError(
  code: ErrorCode,
  key: MessageKey,
  params?: MessageParams,
): ApiError {
  return {
    code,
    message: translate('en', key, params),
    messageKey: key,
    ...(params ? { messageParams: params } : {}),
  };
}
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

export class DomainError extends Error {
  readonly code: ErrorCode;
  /** Catalog key of the message; `message` is its English text. Absent only for
   * verbatim (operator/CLI) text. */
  readonly messageKey?: MessageKey;
  readonly messageParams?: MessageParams;
  /** Browser-facing errors pass a catalog key. `{ text }` is for operator output
   * (CLI scripts) that is never sent to a browser. */
  constructor(
    code: ErrorCode,
    key: MessageKey | { text: string },
    options?: ErrorOptions & { params?: MessageParams },
  ) {
    super(
      typeof key === 'string'
        ? translate('en', key, options?.params)
        : key.text,
      options,
    );
    this.code = code;
    if (typeof key === 'string') {
      this.messageKey = key;
      this.messageParams = options?.params;
    }
    this.name = 'DomainError';
  }
  toApiError(): ApiError {
    return this.messageKey
      ? apiError(this.code, this.messageKey, this.messageParams)
      : { code: this.code, message: this.message };
  }
}

export function assertRevision(actual: number, expected: number): void {
  expectedRevisionSchema.parse(expected);
  if (actual !== expected)
    throw new DomainError('conflict', 'err.theNoteHasChangedKeep');
}

export type NoteAction = 'trash' | 'restore';
export function transitionNote(
  status: NoteStatus,
  priorStatus: RestorableStatus | null,
  action: NoteAction,
): { status: NoteStatus; priorStatus: RestorableStatus | null } {
  if ((status === 'trash') !== (priorStatus !== null))
    throw new DomainError('validation', 'err.invalidNoteState');
  if (action === 'trash' && status !== 'trash')
    return { status: 'trash', priorStatus: status };
  if (action === 'restore' && status === 'trash' && priorStatus)
    return { status: priorStatus, priorStatus: null };
  throw new DomainError('validation', 'err.thisNoteCannotMakeThat');
}

export function validateTimelineAt(value: unknown, now: number): number {
  const instant = instantSchema.parse(value);
  if (instant > instantSchema.parse(now))
    throw new DomainError('validation', 'date.future');
  return instant;
}
