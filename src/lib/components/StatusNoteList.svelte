<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import {
    SvelteMap,
    SvelteSet,
    SvelteURLSearchParams,
  } from 'svelte/reactivity';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import { shortDate } from '#lib/shared/timeline.ts';
  import {
    STATUS_PAGE_SIZE,
    type ListStatus,
    type StatusPage,
    type StatusNote,
  } from '#lib/shared/status-notes.ts';

  let {
    status,
    initial,
    initialError = '',
    q = '',
  }: {
    status: ListStatus;
    initial: StatusPage | null;
    initialError?: string;
    /** Search text the server page was built with; older pages reuse it. */
    q?: string;
  } = $props();

  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);

  let items = $state(untrack(() => initial?.items ?? []));
  let cursor = $state(untrack(() => initial?.nextCursor ?? null));
  let loading = $state(false);
  let ready = $state(false);
  let error = $state('');
  let failed = $state(false);
  let sentinel = $state<HTMLElement>();
  let selectAllBox = $state<HTMLInputElement>();
  let extended = false;

  // Selection is in-memory only; a new search remounts this list and clears it.
  const selected = new SvelteSet<string>();
  type BulkAction = 'restore' | 'permanent-delete';
  let pending = $state<BulkAction | null>(null);
  let bulkBusy = $state(false);
  let bulkMessage = $state('');

  const allSelected = $derived(
    items.length > 0 && items.every((note) => selected.has(note.id)),
  );
  const selectedCount = $derived(
    items.filter((note) => selected.has(note.id)).length,
  );

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

  // Drop selections for notes no longer listed (restored, deleted or searched out).
  $effect(() => {
    const listed = new Set(items.map((note) => note.id));
    untrack(() => {
      for (const id of [...selected]) if (!listed.has(id)) selected.delete(id);
    });
  });

  // Nothing selected means no pending bulk action can run.
  $effect(() => {
    if (!selectedCount) untrack(() => (pending = null));
  });

  onMount(() => {
    ready = true;
    return () => {
      disposed = true;
      request?.abort();
    };
  });

  async function loadMore() {
    if (loading || !cursor) return;
    loading = true;
    error = '';
    failed = false;
    const currentGeneration = ++generation;
    request?.abort();
    request = new AbortController();
    try {
      const params = new SvelteURLSearchParams({
        status,
        limit: String(STATUS_PAGE_SIZE),
        cursor,
      });
      if (q) params.set('q', q);
      const response = await fetch(`/api/notes/status?${params}`, {
        signal: request.signal,
      });
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
      if (!disposed && currentGeneration === generation) {
        failed = true;
        error =
          failure instanceof Error
            ? failure.message
            : 'Could not load older entries.';
      }
    } finally {
      if (!disposed && currentGeneration === generation) loading = false;
    }
  }

  // Scrolling near the end of the notes pane lazy-loads the next page.
  $effect(() => {
    if (!ready || !sentinel || !cursor || failed) return;
    const root = sentinel.closest<HTMLElement>('#notes-pane');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: '0px 0px 300px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  function toggleAll() {
    if (allSelected) selected.clear();
    else for (const note of items) selected.add(note.id);
  }

  $effect(() => {
    if (selectAllBox)
      selectAllBox.indeterminate = selectedCount > 0 && !allSelected;
  });

  function setSelected(id: string, on: boolean) {
    if (on) selected.add(id);
    else selected.delete(id);
  }

  /** Runs the same durable per-note lifecycle as a single action, one at a time.
   * A failure opens the lifecycle dialog and stops; the rest stay selected. */
  async function confirmBulk() {
    const action = pending;
    pending = null;
    const batch = items.filter((note) => selected.has(note.id));
    if (!action || !batch.length || bulkBusy) return;
    if (!lifecycle.ready || lifecycle.busy || lifecycle.selected) {
      bulkMessage = 'Finish the open action first, then try again.';
      return;
    }
    bulkBusy = true;
    bulkMessage = '';
    let done = 0;
    try {
      for (const note of batch) {
        if (disposed) break;
        if (lifecycle.busy || lifecycle.selected) {
          bulkMessage = `Stopped after ${done} of ${batch.length}. Finish the open action, then try the rest again.`;
          break;
        }
        await lifecycle.run(note, action);
        if (lifecycle.selected) {
          bulkMessage = `Stopped after ${done} of ${batch.length}. Resolve the open dialog, then try the rest again.`;
          break;
        }
        selected.delete(note.id);
        done++;
      }
    } finally {
      bulkBusy = false;
    }
  }
</script>

<section aria-label="Trashed notes">
  {#if initialError}<p role="alert">{initialError}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !items.length && !initialError}<p>
      {q ? 'No trashed notes match this search.' : 'Trash is empty.'}
    </p>{/if}
  {#if items.length}
    <div class="bulk-row">
      <input
        bind:this={selectAllBox}
        type="checkbox"
        class="pick"
        aria-label="Select all"
        title="Select all"
        checked={allSelected}
        disabled={!ready || bulkBusy}
        onchange={toggleAll}
      />
      <div class="bulk-actions">
        <button
          type="button"
          class="icon-only"
          aria-label="Restore selected notes"
          title="Restore selected notes"
          disabled={!ready || bulkBusy || lifecycle.busy || !selectedCount}
          onclick={() => {
            bulkMessage = '';
            pending = 'restore';
          }}><Icon name="restore" /></button
        >
        <button
          type="button"
          class="icon-only danger"
          aria-label="Delete selected notes permanently"
          title="Delete selected notes permanently"
          disabled={!ready || bulkBusy || lifecycle.busy || !selectedCount}
          onclick={() => {
            bulkMessage = '';
            pending = 'permanent-delete';
          }}><Icon name="delete-forever" /></button
        >
      </div>
      <span class="help" aria-live="polite">{selectedCount} selected</span>
    </div>
    {#if bulkMessage}<p role="alert">{bulkMessage}</p>{/if}
  {/if}
  <ul class="note-list">
    {#each items as note (note.id)}
      {@const when = shortDate(note.timelineAt, workspace.timezone)}
      <li
        class="surface note-row"
        class:selected={selected.has(note.id)}
        data-testid="trash-note"
        data-note-id={note.id}
        data-revision={note.revision}
      >
        <input
          type="checkbox"
          class="pick"
          checked={selected.has(note.id)}
          disabled={bulkBusy}
          aria-label={`Select note from ${when}`}
          onchange={(event) =>
            setSelected(note.id, event.currentTarget.checked)}
        />
        <a class="when" href={`/notes/${note.id}`}
          ><time datetime={new Date(note.timelineAt).toISOString()}>{when}</time
          ></a
        >
        {#if note.tags.length}<ul class="row-tags" aria-label="Note tags">
            {#each note.tags as tag (tag)}<li>#{tag}</li>{/each}
          </ul>{/if}
        <span class="excerpt">{note.excerpt}</span>
        {#if note.images || note.files}<span class="help meta"
            >{note.images ? `${note.images} image(s)` : ''}{note.images &&
            note.files
              ? ' · '
              : ''}{note.files ? `${note.files} file(s)` : ''}</span
          >{/if}
      </li>
    {/each}
  </ul>
  <Modal
    bind:open={
      () => Boolean(pending && selectedCount),
      (value) => {
        if (!value) pending = null;
      }
    }
    title={pending === 'restore'
      ? 'Restore notes?'
      : 'Delete notes permanently?'}
    dismissible={!bulkBusy}
    customHeader
  >
    <p>
      {pending === 'restore'
        ? `Restore ${selectedCount} ${selectedCount === 1 ? 'note' : 'notes'}?`
        : `Delete ${selectedCount} ${selectedCount === 1 ? 'note' : 'notes'} permanently? This cannot be undone.`}
    </p>
    <div class="confirm">
      <button
        type="button"
        class={pending === 'restore' ? 'primary' : 'danger'}
        onclick={confirmBulk}
        >{pending === 'restore' ? 'Restore' : 'Delete permanently'}</button
      >
      <button type="button" data-initial-focus onclick={() => (pending = null)}
        >Cancel</button
      >
    </div>
  </Modal>
  <div bind:this={sentinel} class="more" aria-live="polite">
    {#if loading}<p class="help">Loading…</p>{/if}
    {#if failed}<button type="button" onclick={loadMore}
        >Retry older entries</button
      >{/if}
  </div>
</section>

<style>
  /* Compact rows: one line each, full column width, one shared height. */
  .note-list {
    --row-height: 2.75rem;
    display: grid;
    gap: var(--space-2);
    width: 100%;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .note-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    height: var(--row-height);
    min-width: 0;
    box-sizing: border-box;
    padding: 0 var(--space-3);
    overflow: hidden;
    border-radius: var(--radius);
  }
  .note-row.selected {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .pick {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin: 0;
    accent-color: var(--accent);
  }
  .when {
    display: inline-flex;
    align-items: center;
    flex: none;
    min-height: 1.75rem;
    padding-inline: var(--space-2);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.875rem;
    text-decoration: none;
  }
  .when:hover,
  .when:focus-visible {
    background: var(--accent-soft);
  }
  .row-tags {
    display: flex;
    flex: 0 1 auto;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .row-tags li {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 1.5rem;
    padding-inline: var(--space-2);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.875rem;
    white-space: nowrap;
  }
  .excerpt {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .meta {
    flex: none;
    white-space: nowrap;
    font-size: 0.875rem;
  }
  /* Same inline padding as .note-row so the select-all box lines up with the row boxes. */
  .bulk-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    min-height: var(--target);
    padding: 0 var(--space-3);
  }
  /* Restore and delete sit together as one tight group, apart from the count text. */
  .bulk-actions {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
  }
  /* Borderless round icon buttons, like .icon-button in global.css.
   * Gray while disabled (no selection); the delete action is red once active. */
  .icon-only {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--target);
    height: var(--target);
    min-width: var(--target);
    min-height: var(--target);
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
  }
  .icon-only:not(:disabled) {
    color: var(--text);
  }
  .icon-only.danger:not(:disabled) {
    color: var(--danger);
  }
  .icon-only:disabled {
    cursor: default;
    opacity: 0.45;
  }
  .icon-only:hover:not(:disabled),
  .icon-only:focus-visible {
    background: var(--accent-soft);
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .more {
    min-height: 1px;
    text-align: center;
  }
</style>
