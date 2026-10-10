<script lang="ts">
  import PageTitle from '#lib/components/PageTitle.svelte';
  import { getContext, onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import type { ApiResult } from '#lib/shared/domain.ts';
  import {
    tagExecuteSchema,
    type TagAction,
    type TagExecute,
    type TagPreview,
    type ManagedTag,
    type TagManagementResult,
  } from '#lib/shared/tags.ts';
  import Modal from '#lib/components/Modal.svelte';
  let { data } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  let source = $state<ManagedTag | null>(null),
    action = $state<TagAction['action']>('rename'),
    target = $state('');
  let preview = $state<TagPreview | null>(null),
    busy = $state(false),
    ready = $state(false),
    error = $state(''),
    status = $state('');
  let open = $state(false),
    pending = $state<TagExecute[]>([]);
  const prefix = `pandanote:tag-actions:v1:${workspace.accountId}:`;
  function reloadRetries() {
    const found: TagExecute[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(prefix)) continue;
        const parsed = tagExecuteSchema.safeParse(
          JSON.parse(localStorage.getItem(key)!),
        );
        if (parsed.success && key === prefix + parsed.data.mutationId)
          found.push(parsed.data);
        else
          error =
            'An unreadable tag retry was retained. Keep a copy and inspect browser storage.';
      }
      pending = found;
    } catch {
      error =
        'Tag retry storage is unavailable. No new action can be sent safely.';
    }
  }
  onMount(() => {
    ready = true;
    reloadRetries();
    const changed = () => reloadRetries();
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  });
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
  async function showPreview() {
    if (!source || busy) return;
    busy = true;
    error = '';
    preview = null;
    try {
      preview = await api<TagPreview>('/api/tags/preview', {
        source: source.key,
        action,
        target: action === 'remove' ? null : target,
      });
      open = true;
    } catch (e) {
      error =
        e instanceof Error ? e.message : 'Preview failed. Nothing changed.';
    } finally {
      busy = false;
    }
  }
  async function execute(command: TagExecute) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      // Persist exact identity before network. Independent records cannot overwrite
      // another tab's action; response loss/reload retries resolve the original receipt.
      localStorage.setItem(
        prefix + command.mutationId,
        JSON.stringify(command),
      );
      reloadRetries();
      const result = await api<TagManagementResult>('/api/tags', command);
      localStorage.removeItem(prefix + command.mutationId);
      reloadRetries();
      open = false;
      preview = null;
      source = null;
      status = `Updated ${result.affected} notes.`;
      workspace.tagsChanged++;
      await invalidate('pandanote:tags');
    } catch (e) {
      error =
        e instanceof Error && e.name === 'Error'
          ? e.message
          : 'Confirmation unavailable. Retry this exact operation; your notes are protected.';
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle title="Manage tags" />
<section class="surface">
  <h1>Manage tags</h1>
  <p class="help">
    Rename, merge or remove actual hashtags in notes and Trash. Code, URLs and
    unrelated formatting stay untouched.
  </p>
  <form method="GET">
    <label>Find tags <input name="q" maxlength="256" /></label><button
      >Search tags</button
    >
  </form>
  <p class="help">
    Up to 100 tags shown. Search to find more. Published counts exclude Trash.
  </p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if pending.length}<section aria-label="Unconfirmed tag operations">
      <h2>Unconfirmed tag operations · this browser</h2>
      <p>
        Retry to check the original result. Stopping a retry does not cancel or
        undo a server operation.
      </p>
      {#each pending as command (command.mutationId)}<div>
          <span>{command.operation.action} #{command.operation.source}</span
          ><button disabled={busy} onclick={() => execute(command)}
            >Check and retry tag operation</button
          ><button
            disabled={busy}
            onclick={() => {
              if (
                confirm(
                  'Stop retrying? This does not cancel or undo the server operation.',
                )
              ) {
                localStorage.removeItem(prefix + command.mutationId);
                reloadRetries();
              }
            }}>Stop retrying</button
          >
        </div>{/each}
    </section>{/if}
  <ul class="tag-list">
    {#each data.managedTags as tag (tag.key)}<li>
        <button
          disabled={!ready || busy}
          onclick={() => {
            source = tag;
            target = tag.display;
            action = 'rename';
            preview = null;
            error = '';
          }}>#{tag.display}</button
        ><span>{tag.published} notes · {tag.trash} Trash</span>
      </li>{/each}
  </ul>
  {#if !data.managedTags.length}<p>No matching tags.</p>{/if}
  {#if source}<form
      onsubmit={(e) => {
        e.preventDefault();
        void showPreview();
      }}
    >
      <h2>Manage #{source.display}</h2>
      <label
        >Action <select
          bind:value={action}
          disabled={busy}
          aria-label="Tag action"
          ><option value="rename">Rename (including case-only)</option><option
            value="merge">Merge into an existing tag</option
          ><option value="remove">Remove hashtag from notes</option></select
        ></label
      >
      {#if action !== 'remove'}<label
          >Target tag spelling <input
            bind:value={target}
            maxlength="128"
            required
            disabled={busy}
            list="existing-tag-targets"
          /></label
        ><datalist id="existing-tag-targets"
          >{#each data.managedTags as tag (tag.key)}<option value={tag.display}
            ></option>{/each}</datalist
        >{/if}
      <button disabled={busy}>Preview tag changes</button>
    </form>{/if}
</section>
<Modal bind:open title="Confirm tag changes" dismissible={!busy}>
  {#if preview}<p>
      {preview.operation.action} #{preview.operation.source}{preview.operation
        .target
        ? ` → #${preview.operation.target}`
        : ''}
    </p>
    <p>
      {preview.counts.published} notes · {preview.counts.trash} Trash notes will receive
      new revisions. In-progress editors will conflict.
    </p>
    {#if preview.operation.action === 'merge'}<p>
        The existing target spelling is retained; duplicate note joins are
        collapsed.
      </p>{/if}
    {#if preview.targetRetired}<p role="alert">
        The target was retired before. Reusing it does not erase history; local
        posts using it require explicit acknowledgement.
      </p>{/if}
    <p>
      Removal deletes only the hashtag token, preserving adjacent spaces. Notes
      are not deleted. Below are up to 10 source excerpts; all counted notes are
      affected.
    </p>
    {#each preview.samples as sample (sample.id)}<details>
        <summary
          >{sample.status} · revision {sample.revision} ·
          <a href={`/notes/${sample.id}`}>Inspect full note</a></summary
        >
        <pre>{sample.before}</pre>
        <pre>{sample.after}</pre>
      </details>{/each}
    {#if error}<p role="alert">{error}</p>{/if}
    <button
      class:danger={preview.operation.action === 'remove'}
      disabled={busy || pending.length > 0}
      onclick={() =>
        execute({
          mutationId: crypto.randomUUID(),
          operation: preview!.operation,
          previewToken: preview!.previewToken,
          confirmed: true,
        })}>Confirm {preview.operation.action}</button
    >
  {/if}
</Modal>

<style>
  .tag-list {
    list-style: none;
    padding: 0;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block: var(--space-2);
  }
  label {
    display: block;
    margin-block: var(--space-2);
  }
  input,
  select {
    max-width: 100%;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: var(--space-2);
    border: 1px solid var(--border);
  }
</style>
