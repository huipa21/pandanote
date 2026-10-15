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
