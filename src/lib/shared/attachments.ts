import { z } from 'zod';
import { digestSchema, idSchema, mutationIdentitySchema } from './domain.ts';

export const filenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (v) => new TextDecoder().decode(new TextEncoder().encode(v)) === v,
    'Filename must be valid Unicode',
  )
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), 'Invalid filename');
/** Rename a saved voice clip. The bytes, digest and MIME never change. */
export const renameAttachmentSchema = z.strictObject({
  filename: filenameSchema.refine(
    (v) => !/[/\\:*?"<>|]/.test(v) && v.trim() === v && !v.startsWith('.'),
    'Invalid filename',
  ),
});
// Frozen input identity, not client-supplied filesystem paths or trusted MIME.
export const uploadItemSchema = z.strictObject({
  id: idSchema,
  filename: filenameSchema,
  incomingBytes: z
    .number()
    .int()
    .min(0)
    .max(500 * 1024 * 1024),
  incomingDigest: digestSchema,
  /** Voice clip: the bytes must be a recognised audio container and are then
   * stored as `audio/*`. Without it audio containers stay opaque downloads. */
  voice: z.boolean().optional(),
});
/** Provisional `detectedMime` of a pending voice item. The flag is persisted in
 * this existing column (no schema change); it is replaced by the detected
 * container MIME when the upload becomes ready. */
export const VOICE_PENDING_MIME = 'audio/x-voice-pending';
export const VOICE_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const;
export const isVoiceMime = (mime: string): boolean =>
  (VOICE_MIMES as readonly string[]).includes(mime);
/** A stored voice clip: a `file` attachment whose detected MIME is an audio container. */
export const isVoiceClip = (file: { kind: string; mime: string }): boolean =>
  file.kind === 'file' && isVoiceMime(file.mime);

/** Pictographic categories for a generic (non-image) file attachment's icon: a
 * recognisable app-style glyph (Word/Excel/PowerPoint/PDF/archive colours, or
 * a media/code/text pictogram) for common extensions; anything else falls
 * back to a short uppercase extension label (or a bare document glyph). */
export type FileIconKind =
  | 'audio'
  | 'video'
  | 'code'
  | 'text'
  | 'image'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'pdf'
  | 'archive';
const FILE_ICON_EXTENSIONS: Record<FileIconKind, readonly string[]> = {
  audio: ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'oga', 'opus', 'wma'],
  video: [
    'mp4',
    'm4v',
    'mov',
    'webm',
    'mkv',
    'avi',
    '3gp',
    'mpeg',
    'mpg',
    'ogv',
    'wmv',
    'flv',
  ],
  code: [
    'js',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'jsx',
    'json',
    'html',
    'htm',
    'css',
    'py',
    'java',
    'c',
    'h',
    'cpp',
    'rs',
    'go',
    'rb',
    'php',
    'sh',
    'bash',
    'yml',
    'yaml',
    'xml',
    'svelte',
    'vue',
    'sql',
  ],
  text: ['txt', 'md', 'markdown', 'log', 'rtf'],
  image: ['svg', 'heic', 'heif', 'tif', 'tiff'],
  word: ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt'],
  excel: ['xls', 'xlsx', 'xlsm', 'xlsb', 'csv', 'ods'],
  powerpoint: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'odp'],
  pdf: ['pdf'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'],
};
const EXT_TO_ICON_KIND = new Map<string, FileIconKind>(
  Object.entries(FILE_ICON_EXTENSIONS).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as FileIconKind]),
  ),
);
function fileExtension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}
/** Best-guess icon category from the filename alone (presentation only; the
 * server never trusts this for processing/validation decisions). */
export function fileIconKind(filename: string): FileIconKind | null {
  const extension = fileExtension(filename);
  return extension ? (EXT_TO_ICON_KIND.get(extension) ?? null) : null;
}
/** Short label shown on a generic document-style icon, e.g. "PDF", "ZIP", "DOCX". */
export function fileExtensionLabel(filename: string): string {
  return fileExtension(filename).slice(0, 4).toUpperCase();
}
/** Short mark shown inside the brand-coloured band of a Word/Excel/PowerPoint/
 * PDF/archive style icon, echoing the real application's monogram. */
const BRAND_MARKS: Partial<Record<FileIconKind, string>> = {
  word: 'W',
  excel: 'X',
  powerpoint: 'P',
  pdf: 'PDF',
  archive: 'ZIP',
};
export function fileBrandMark(kind: FileIconKind): string | null {
  return BRAND_MARKS[kind] ?? null;
}

/** Human-readable file size: bytes under 1 KiB, otherwise KB/MB with up to one
 * decimal place (trailing ".0" dropped). Returns the i18n message key and
 * params to pass straight to `t(...)`. */
export function formatFileSize(bytes: number):
  | { key: 'note.bytes'; params: { count: number } }
  | {
      key: 'note.kilobytes' | 'note.megabytes';
      params: { value: string };
    } {
  if (bytes < 1024) return { key: 'note.bytes', params: { count: bytes } };
  const kib = bytes / 1024;
  if (kib < 1024) {
    return { key: 'note.kilobytes', params: { value: oneDecimal(kib) } };
  }
  return { key: 'note.megabytes', params: { value: oneDecimal(kib / 1024) } };
}
function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}
export const initializeBatchSchema = mutationIdentitySchema
  .extend({
    items: z.array(uploadItemSchema).max(100),
  })
  .refine(
    (v) => new Set(v.items.map((item) => item.id)).size === v.items.length,
    'Duplicate attachment IDs',
  );
export type UploadItem = z.infer<typeof uploadItemSchema>;
export type InitializeBatch = z.infer<typeof initializeBatchSchema>;
export interface ReadyAttachment {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  mime: string;
  incomingBytes: number;
  readiness: 'pending' | 'ready' | 'failed';
  storedBytes: number;
  width: number | null;
  height: number | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}
export interface UploadBatchDto {
  id: string;
  status: 'pending' | 'committed' | 'abandoned';
  attachments: ReadyAttachment[];
}
export type InitializeBatchResult =
  | { state: 'batch'; batch: UploadBatchDto }
  | { state: 'confirmed'; result: import('./domain.ts').MutationResult };
