<script lang="ts">
  import { getContext, onMount, untrack, tick } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  import type { RenderedMarkdown } from '#lib/shared/markdown/render.ts';
  import { cardImages } from '#lib/shared/timeline.ts';
  import Modal from './Modal.svelte';
  import LocationPopover from './LocationPopover.svelte';
  import Markdown from './Markdown.svelte';
  import ImageViewer from './ImageViewer.svelte';
  let {
    note,
    rendered,
    error = '',
    onClose,
    onRetry = () => {},
    initialImage,
    direct = false,
  }: {
    note: NoteSnapshot | null;
    rendered?: RenderedMarkdown;
    error?: string;
    onClose: () => void | Promise<void>;
    onRetry?: () => void;
    initialImage?: string;
    direct?: boolean;
  } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  let open = $state(true);
  let ready = $state(false);
  let editing = $state(false);
  let editError = $state('');
  let selected = $state<string | null>(null);
  const images = $derived(
    (note?.attachments ?? []).filter((file) => file.kind === 'image'),
  );
  let initialConsumed = false;
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    if (
      ready &&
      initialImage &&
      images.some((file) => file.id === initialImage)
    )
      untrack(() => {
        if (!initialConsumed) {
          initialConsumed = true;
          selected = initialImage!;
        }
      });
  });
  function date(value: number) {
    return new Date(value).toLocaleString('en', {
      timeZone: workspace.timezone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
  }
  async function edit() {
    if (!note || editing) return;
    editing = true;
    // Prepare a complete in-memory editor before closing detail.
    if (await workspace.editNote(note, false)) {
      const conflict = workspace.postConflict;
      workspace.postConflict = null;
      await onClose();
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

<Modal
  bind:open
  title="Note detail"
  kind="detail"
  ssrOpen={direct}
  onDismiss={() => {
    void onClose();
  }}
  dismissible={!editing}
>
  {#if error}<p role="alert">{error}</p>
    <button onclick={onRetry}>Retry note</button>
  {:else if !note}<p role="status">Loading full note…</p>
  {:else}
    <article
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
        <a href={`/notes/${note.id}`}>Private permalink</a>
        {#if note.status === 'trash'}
          <button
            disabled={!ready || !lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note!, 'restore')}>Restore</button
          >
          <button
            class="danger"
            disabled={!ready || !lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note!, 'permanent-delete')}
            >Permanently delete</button
          >
        {:else}
          <button
            disabled={!ready || !lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note!, 'trash')}
            >Move to Trash</button
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
      {#if images.length}<ul class="gallery" aria-label="Note images">
          {#each images as image, index (image.id)}<li>
              <button
                disabled={!ready}
                onclick={() => {
                  selected = image.id;
                }}>Open image {index + 1}: {image.filename}</button
              >
            </li>{/each}
        </ul>{/if}
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
  {/if}
  {#if direct}<a href="/">Return to All notes</a>{/if}
</Modal>
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
  .gallery {
    list-style: none;
    padding: 0;
  }
  li a {
    display: inline-flex;
    align-items: center;
    min-height: var(--target);
  }
</style>
