<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { invalidate } from '$app/navigation';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
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
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  let items = $state(untrack(() => initial?.items ?? []));
  let cursor = $state(untrack(() => initial?.nextCursor ?? null));
  let loading = $state(false);
  let ready = $state(false);
  let error = $state('');
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
    });
  });
  onMount(() => {
    ready = true;
    return () => {
      disposed = true;
      request?.abort();
    };
  });
  async function older() {
    if (loading || !cursor) return;
    loading = true;
    error = '';
    const currentGeneration = ++generation;
    request?.abort();
    request = new AbortController();
    try {
      const response = await fetch(
        `/api/notes/status?status=${status}&cursor=${encodeURIComponent(cursor)}`,
        { signal: request.signal },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        data?: StatusPage;
        error?: { message: string };
      };
      if (disposed || currentGeneration !== generation) return;
      if (!payload.ok)
        throw new Error(payload.error?.message ?? 'Older entries failed');
      extended = true;
      items = merge(items, payload.data!.items);
      cursor = payload.data!.nextCursor;
    } catch (failure) {
      if (!disposed && currentGeneration === generation)
        error =
          failure instanceof Error
            ? failure.message
            : 'Could not load older entries.';
    } finally {
      if (!disposed && currentGeneration === generation) loading = false;
    }
  }
</script>

<section class="surface" aria-label="Trashed notes">
  {#if initialError}<p role="alert">{initialError}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <button
    disabled={!ready || loading}
    onclick={() => {
      extended = false;
      void invalidate('pandanote:status-notes');
    }}>Refresh Trash</button
  >
  {#if !items.length && !initialError}<p>Trash is empty.</p>{/if}
  <ul>
    {#each items as note (note.id)}
      <li
        data-testid="trash-note"
        data-note-id={note.id}
        data-revision={note.revision}
      >
        <p class="excerpt">{note.excerpt}</p>
        <p class="help">
          Timeline: {new Date(note.timelineAt).toLocaleString('en', {
            timeZone: workspace.timezone,
          })} · {note.images} image(s) · {note.files} file(s) · revision {note.revision}
        </p>
        <a href={`/notes/${note.id}`}>Open trashed note</a>
        <button
          disabled={!lifecycle.ready || lifecycle.busy}
          onclick={() => lifecycle.choose(note, 'restore')}>Restore</button
        ><button
          class="danger"
          disabled={!lifecycle.ready || lifecycle.busy}
          onclick={() => lifecycle.choose(note, 'permanent-delete')}
          >Permanently delete</button
        >
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
  }
</style>
