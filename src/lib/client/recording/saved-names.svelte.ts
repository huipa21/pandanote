import { SvelteMap } from 'svelte/reactivity';
import type { ApiResult } from '#lib/shared/domain.ts';
import type { ReadyAttachment } from '#lib/shared/attachments.ts';
import { tr, trError } from '../i18n-current.ts';

/** New names of saved clips renamed in this page session. Cards and note pages keep the
 * server snapshot they were loaded with; this keeps them (and a note opened for editing)
 * showing the current name without a reload. A reload reads the stored name. */
export const savedClipNames = new SvelteMap<string, string>();

export type RenameResult =
  { ok: true; filename: string } | { ok: false; message: string };

/** Rename a saved voice clip on the server. `filename` is the complete new name. */
export async function renameSavedClip(
  id: string,
  filename: string,
): Promise<RenameResult> {
  try {
    const response = await fetch(`/api/attachments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as ApiResult<ReadyAttachment>;
    if (!payload.ok) return { ok: false, message: trError(payload.error) };
    savedClipNames.set(id, payload.data.filename);
    return { ok: true, filename: payload.data.filename };
  } catch {
    return { ok: false, message: tr('rec.renameFailed') };
  }
}
