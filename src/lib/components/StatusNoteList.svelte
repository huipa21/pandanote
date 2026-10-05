<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { invalidate, pushState } from '$app/navigation';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/drafts/lifecycle.svelte.ts';
  import type { ApiResult, NoteSnapshot } from '#lib/shared/domain.ts';
  import type {
    ListStatus,
    StatusPage,
    StatusNote,
  } from '#lib/shared/status-notes.ts';
  let {
    status,
    initial,
    initialError = '',
  }: {
    status: ListStatus;
    initial: StatusPage | null;
    initialError?: string;
  } = $props();
  const workspace = getContext<DraftWorkspace>(DRAFT_WORKSPACE);
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  let items = $state(untrack(() => initial?.items ?? []));
  let cursor = $state(untrack(() => initial?.nextCursor ?? null));
  let loading = $state(false);
  let ready = $state(false);
  let error = $state('');
  let editing = $state<string | null>(null);
  let extended = false;
  function merge(current: StatusNote[], incoming: StatusNote[]) {
    const notes = new SvelteMap(current.map((note) => [note.id, note]));
    for (const note of incoming)
      if (!notes.has(note.id) || notes.get(note.id)!.revision <= note.revision)
        notes.set(note.id, note);
    return [...notes.values()]
      .filter(
        (note) =>
          !workspace.recentMutations.some(
            (result) =>
              result.noteId === note.id &&
              result.revision >= note.revision &&
              (result.deleted || result.status !== status),
          ),
      )
      .sort(
        (a, b) =>
          b.timelineAt - a.timelineAt ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
  }
  let generation = 0;
  let disposed = false;
  let request: AbortController | undefined;
  $effect(() => {
    const page = initial;
    untrack(() => {
      generation++;
      request?.abort();
      loading = false;
      if (page) {
        items = merge(extended ? items : [], page.items);
        if (!extended) cursor = page.nextCursor;
      }
      error = '';
    });
  });
  onMount(() => {
    ready = true;
    return () => {
      disposed = true;
      generation++;
      request?.abort();
    };
  });
  async function older() {
    if (loading || !cursor) return;
    const current = ++generation;
    const controller = new AbortController();
    request = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    loading = true;
    error = '';
    try {
      const response = await fetch(
        `/api/notes/status?${new URLSearchParams({ status, cursor })}`,
        { signal: request.signal },
      );
      const payload = (await response.json()) as ApiResult<StatusPage>;
      if (current !== generation || disposed) return;
      if (!payload.ok) throw new Error(payload.error.message);
      if (payload.data.status !== status)
        throw new Error('The list changed. Refresh before continuing.');
      items = merge(items, payload.data.items);
      extended = true;
      cursor = payload.data.nextCursor;
    } catch (failure) {
      if (current === generation && !disposed)
        error =
          failure instanceof Error &&
          !['AbortError', 'TypeError'].includes(failure.name)
            ? failure.message
            : 'Older entries could not be loaded. Retry safely.';
    } finally {
      clearTimeout(timer);
      if (current === generation) loading = false;
    }
  }
  async function edit(id: string) {
    if (editing || workspace.busy) return;
    editing = id;
    error = '';
    try {
      const response = await fetch(`/api/notes/${id}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as ApiResult<NoteSnapshot>;
      if (disposed) return;
      if (!payload.ok) throw new Error(payload.error.message);
      if (payload.data.status !== 'draft') {
        await invalidate('pandanote:status-notes');
        throw new Error(
          'This server draft changed status. Inspect the server note; local edits are kept.',
        );
      }
      if (!(await workspace.editNote(payload.data)))
        throw new Error(
          workspace.error ||
            'Could not open recovery. Keep current edits and retry.',
        );
      if (
        items.find((note) => note.id === id)?.revision !== payload.data.revision
      )
        void invalidate('pandanote:status-notes');
    } catch (failure) {
      if (!disposed)
        error =
          failure instanceof Error
            ? failure.message
            : 'Draft could not be opened. Retry.';
    } finally {
      if (!disposed) editing = null;
    }
  }
  function open(event: MouseEvent, id: string) {
    if (
      event.button ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void pushState(`/notes/${id}`, { detailId: id });
  }
</script>

<section
  class="surface"
  aria-label={status === 'draft' ? 'Server drafts' : 'Trashed notes'}
>
  {#if status === 'draft'}<h2>Server drafts · available on other devices</h2>
    <p>
      Last saved server versions. Edits and new files stay on this browser until
      Post; there is no background server save.
    </p>{/if}
  {#if initialError}<p role="alert">{initialError}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <button
    disabled={!ready || loading}
    onclick={() => {
      extended = false;
      void invalidate('pandanote:status-notes');
    }}>Refresh {status === 'draft' ? 'server drafts' : 'Trash'}</button
  >
  {#if !items.length && !initialError}<p>
      {status === 'draft'
        ? 'No server drafts. Move a published note to Drafts from its actions.'
        : 'Trash is empty.'}
    </p>{/if}
  <ul>
    {#each items as note (note.id)}
      {@const recoveries = workspace.drafts.filter(
        (draft) => draft.serverBase?.noteId === note.id,
      )}
      <li
        data-testid={status === 'draft' ? 'server-draft' : 'trash-note'}
        data-note-id={note.id}
        data-revision={note.revision}
      >
        <p class="excerpt">
          {status === 'draft' && recoveries.length
            ? 'Last saved server version: '
            : ''}{note.excerpt}
        </p>
        <p class="help">
          Timeline: {new Date(note.timelineAt).toLocaleString('en', {
            timeZone: workspace.timezone,
          })} · {note.images} image(s) · {note.files} file(s) · revision {note.revision}{note.priorStatus
            ? ` · restores to ${note.priorStatus}`
            : ''}
        </p>
        {#if recoveries.length}<p class="help">
            {recoveries.length} device-only recovery {recoveries.length === 1
              ? 'copy'
              : 'copies'} in Local drafts. Reopening uses local recovery, never silently
            replaces it with server text.{recoveries.some(
              (d) => d.serverBase!.revision !== note.revision,
            )
              ? ' A recovery has a different base revision; compare before saving.'
              : ''}
          </p>{/if}
        <a href={`/notes/${note.id}`} onclick={(event) => open(event, note.id)}
          >Open {status === 'draft' ? 'server draft' : 'trashed note'}</a
        >
        {#if status === 'draft'}<button
            disabled={!workspace.ready || workspace.busy || Boolean(editing)}
            onclick={() => edit(note.id)}
            >{editing === note.id
              ? 'Opening…'
              : recoveries.length
                ? 'Resume local recovery'
                : 'Edit server draft'}</button
          ><button
            disabled={!lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note, 'trash')}
            >Move to Trash</button
          >
        {:else}<button
            disabled={!lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note, 'restore')}>Restore</button
          ><button
            class="danger"
            disabled={!lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note, 'permanent-delete')}
            >Permanently delete</button
          >{/if}
      </li>
    {/each}
  </ul>
  {#if cursor}<button disabled={!ready || loading} onclick={older}
      >{loading
        ? 'Loading…'
        : error
          ? 'Retry older entries'
          : 'Load older entries'}</button
    >{/if}
</section>

<style>
  ul {
    padding: 0;
    list-style: none;
  }
  li {
    border-top: 1px solid var(--border);
    padding-block: var(--space-3);
  }
  .excerpt {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  a {
    display: inline-flex;
    align-items: center;
    min-height: var(--target);
    margin-right: var(--space-2);
  }
</style>
