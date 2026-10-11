<script lang="ts">
  import { getContext, onMount, tick } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  import type { RenderedMarkdown } from '#lib/shared/markdown/render.ts';
  import { cardImages, gridImages } from '#lib/shared/timeline.ts';
  import ThumbnailGrid from './ThumbnailGrid.svelte';
  import LocationPopover from './LocationPopover.svelte';
  import Markdown from './Markdown.svelte';
  import ImageViewer from './ImageViewer.svelte';
  let {
    note,
    rendered,
    onLeave,
  }: {
    note: NoteSnapshot;
    rendered?: RenderedMarkdown;
    /** Leaves the note page (to the timeline) before the editor opens. */
    onLeave: () => void | Promise<void>;
  } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  let ready = $state(false);
  let editing = $state(false);
  let editError = $state('');
  let selected = $state<string | null>(null);
  const images = $derived(
    (note.attachments ?? []).filter((file) => file.kind === 'image'),
  );
  onMount(() => {
    ready = true;
  });
  function date(value: number) {
    return new Date(value).toLocaleString('en', {
      timeZone: workspace.timezone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
  }
  async function edit() {
    if (editing) return;
    editing = true;
    // Prepare a complete in-memory editor before leaving the note page.
    if (await workspace.editNote(note, false)) {
      const conflict = workspace.postConflict;
      workspace.postConflict = null;
      await onLeave();
      await tick();
      workspace.openEditor++;
      await tick();
      workspace.postConflict = conflict;
    } else
      editError =
        workspace.error ||
        'Could not open the editor. Keep your current text and retry.';
    editing = false;
  }
</script>

<section class="note-page" aria-label="Note detail">
  <p><a href="/">← All notes</a></p>
  <article
    class="surface"
    data-testid="note-detail"
    data-note-id={note.id}
    data-revision={note.revision}
  >
    <div class="actions">
      <button
        disabled={!ready ||
          !workspace.ready ||
          workspace.busy ||
          note.status === 'trash' ||
          editing}
        onclick={edit}>Edit note</button
      >
      {#if note.status === 'trash'}
        <button
          disabled={!ready || !lifecycle.ready || lifecycle.busy}
          onclick={() => lifecycle.choose(note, 'restore')}>Restore</button
        >
        <button
          class="danger"
          disabled={!ready || !lifecycle.ready || lifecycle.busy}
          onclick={() => lifecycle.choose(note, 'permanent-delete')}
          >Permanently delete</button
        >
      {:else}
        <button
          disabled={!ready || !lifecycle.ready || lifecycle.busy}
          onclick={() => lifecycle.choose(note, 'trash')}>Move to Trash</button
        >
      {/if}
    </div>
    {#if editError}<p role="alert">{editError}</p>{/if}
    <Markdown
      source={note.bodyMarkdown}
      images={cardImages(note)}
      initial={rendered}
      foreground
      onImage={(id) => {
        selected = id;
      }}
    />
    <ThumbnailGrid
      images={gridImages(note)}
      disabled={!ready}
      onOpen={(id) => {
        selected = id;
      }}
    />
    <ul class="files" aria-label="Attachments">
      {#each (note.attachments ?? []).filter((file) => file.kind === 'file') as file (file.id)}<li
        >
          <a href={`/api/attachments/${file.id}/file`} download
            >{file.filename}</a
          >
          · {file.storedBytes} bytes
        </li>{/each}
    </ul>
    <dl>
      <dt>Status</dt>
      <dd>
        {note.status}{note.priorStatus ? ` (was ${note.priorStatus})` : ''}
      </dd>
      <dt>Timeline</dt>
      <dd>{date(note.timelineAt)}</dd>
      <dt>Created</dt>
      <dd>{date(note.createdAt)}</dd>
      <dt>Last modified</dt>
      <dd>{date(note.updatedAt)}</dd>
      {#if note.contentEditedAt !== null}<dt>Content edited</dt>
        <dd>{date(note.contentEditedAt)}</dd>{/if}
      <dt>Revision</dt>
      <dd>{note.revision}</dd>
      {#if note.tags.length}<dt>Tags</dt>
        <dd>{note.tags.map((tag) => `#${tag}`).join(' ')}</dd>{/if}
      {#if note.location}<dt>Location</dt>
        <dd>
          <LocationPopover location={note.location} />
        </dd>{/if}
    </dl>
  </article>
</section>
{#if selected && images.some((image) => image.id === selected)}
  <ImageViewer
    {images}
    {selected}
    onClose={() => {
      selected = null;
    }}
  />
{/if}

<style>
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    font-size: 0.875rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  ul {
    padding-left: var(--space-4);
    overflow-wrap: anywhere;
  }
  li a {
    display: inline-flex;
    align-items: center;
    min-height: var(--target);
  }
</style>
