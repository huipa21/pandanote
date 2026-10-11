import { invalidate } from '$app/navigation';
import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
import type { ApiResult } from '#lib/shared/domain.ts';
import {
  tagExecuteSchema,
  type TagAction,
  type TagExecute,
  type TagManagementResult,
  type TagPreview,
} from '#lib/shared/tags.ts';

async function api<T>(path: string, command: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(30000),
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

/**
 * Client side of tag rename/merge/remove: preview, then confirm. The exact confirmed
 * command is persisted before the network call so a lost response or reload can be
 * resolved against the original server receipt (never re-previewed or duplicated).
 */
export class TagOperations {
  pending = $state<TagExecute[]>([]);
  busy = $state(false);
  error = $state('');
  preview = $state<TagPreview | null>(null);
  private readonly prefix: string;
  private readonly workspace: EditorWorkspace;
  constructor(workspace: EditorWorkspace) {
    this.workspace = workspace;
    this.prefix = `pandanote:tag-actions:v1:${workspace.accountId}:`;
  }
  /** Begin watching retry records; returns the cleanup. */
  start(): () => void {
    this.reload();
    const changed = () => this.reload();
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }
  reload() {
    const found: TagExecute[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(this.prefix)) continue;
        const parsed = tagExecuteSchema.safeParse(
          JSON.parse(localStorage.getItem(key)!),
        );
        if (parsed.success && key === this.prefix + parsed.data.mutationId)
          found.push(parsed.data);
        else
          this.error =
            'An unreadable tag retry was retained. Keep a copy and inspect browser storage.';
      }
      this.pending = found;
    } catch {
      this.error =
        'Tag retry storage is unavailable. No new action can be sent safely.';
    }
  }
  discard(command: TagExecute) {
    localStorage.removeItem(this.prefix + command.mutationId);
    this.reload();
  }
  reset() {
    this.preview = null;
    this.error = '';
  }
  async showPreview(operation: TagAction): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    this.preview = null;
    try {
      this.preview = await api<TagPreview>('/api/tags/preview', operation);
      return true;
    } catch (e) {
      this.error =
        e instanceof Error ? e.message : 'Preview failed. Nothing changed.';
      return false;
    } finally {
      this.busy = false;
    }
  }
  /** Returns the result, or null when unconfirmed (retry record stays). */
  async execute(command: TagExecute): Promise<TagManagementResult | null> {
    if (this.busy) return null;
    this.busy = true;
    this.error = '';
    try {
      localStorage.setItem(
        this.prefix + command.mutationId,
        JSON.stringify(command),
      );
      this.reload();
      const result = await api<TagManagementResult>('/api/tags', command);
      localStorage.removeItem(this.prefix + command.mutationId);
      this.reload();
      this.preview = null;
      this.workspace.tagsChanged++;
      await invalidate('pandanote:tags');
      return result;
    } catch (e) {
      this.error =
        e instanceof Error && e.name === 'Error'
          ? e.message
          : 'Confirmation unavailable. Retry this exact operation; your notes are protected.';
      return null;
    } finally {
      this.busy = false;
    }
  }
}
