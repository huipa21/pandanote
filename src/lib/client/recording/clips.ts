import type { MessageKey } from '#lib/shared/i18n/index.ts';
import type { EditorAttachment } from '../editor/model.ts';
import type { RecorderErrorCode } from './recorder.ts';
import { isVideoMeta, MAX_VOICE_CLIPS } from '../uploads/file-kind.ts';

export const isClip = (a: EditorAttachment): boolean => a.kind === 'audio';
export const isVideoAttachment = (a: EditorAttachment): boolean =>
  a.kind === 'file' && isVideoMeta({ type: a.mime, name: a.filename });

/** Why one more clip cannot be added, or null. A video excludes clips (and photos);
 * clips do not count toward the photo limit but do count toward the per-note
 * attachment cap. `reserved` counts a take in progress that will become a clip. */
export function clipRejection(
  attachments: readonly EditorAttachment[],
  maxAttachmentsPerNote: number,
  reserved = 0,
): { key: MessageKey; params?: Record<string, number> } | null {
  if (attachments.some(isVideoAttachment)) return { key: 'rec.videoClips' };
  if (attachments.filter(isClip).length + reserved >= MAX_VOICE_CLIPS)
    return { key: 'rec.maxClips', params: { count: MAX_VOICE_CLIPS } };
  if (attachments.length + reserved >= maxAttachmentsPerNote)
    return {
      key: 'work.maxFiles',
      params: { count: maxAttachmentsPerNote },
    };
  return null;
}

export const RECORDER_ERROR_KEYS: Record<RecorderErrorCode, MessageKey> = {
  insecure: 'rec.errInsecure',
  unsupported: 'rec.errUnsupported',
  denied: 'rec.errDenied',
  'no-device': 'rec.errNoDevice',
  busy: 'rec.errBusy',
  ended: 'rec.errFailed',
  empty: 'rec.errEmpty',
  short: 'rec.errShort',
  failed: 'rec.errFailed',
};

const FILE_EXTENSION = /\.[A-Za-z0-9]{1,5}$/;
/** Split a clip filename into an editable base and its fixed extension (with dot). */
export function splitClipName(filename: string): {
  base: string;
  extension: string;
} {
  const extension = FILE_EXTENSION.exec(filename)?.[0] ?? '';
  return {
    base: filename.slice(0, filename.length - extension.length),
    extension,
  };
}
/** The new stored filename for a rename, or null when the name is unusable (empty after
 * cleanup). The container extension is fixed (the bytes do not change), path separators
 * and other filesystem-hostile characters become `-`, control/format characters vanish. */
export function renamedClipFilename(
  current: string,
  input: string,
): string | null {
  const { extension } = splitClipName(current);
  let base = input
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim();
  // A typed extension is the same as the fixed one; do not double it.
  if (extension && base.toLowerCase().endsWith(extension.toLowerCase()))
    base = base.slice(0, base.length - extension.length).trim();
  base = base.replace(/^\.+/, '');
  if (!base) return null;
  return `${base.slice(0, 255 - extension.length)}${extension}`;
}
