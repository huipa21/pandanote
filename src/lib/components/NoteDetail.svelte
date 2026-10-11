<script lang="ts">
  import { getContext, onDestroy, onMount, tick, untrack } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  import type { RenderedMarkdown } from '#lib/shared/markdown/render.ts';
  import { cardImages, gridImages } from '#lib/shared/timeline.ts';
  import ThumbnailGrid from './ThumbnailGrid.svelte';
  import LocationPopover from './LocationPopover.svelte';
  import Markdown from './Markdown.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ActionMenu, { type ActionMenuItem } from './ActionMenu.svelte';
  import Icon from './Icon.svelte';
  import NoteEditor from './NoteEditor.svelte';
  let {
    note,
    rendered,
  }: {
    note: NoteSnapshot;
    rendered?: RenderedMarkdown;
  } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  const { t } = useI18n();
  let ready = $state(false);
  let editError = $state('');
  let selected = $state<string | null>(null);
  let menuTrigger = $state<HTMLButtonElement>();
  let editor = $state<ReturnType<typeof NoteEditor>>();
  const images = $derived(
    (note.attachments ?? []).filter((file) => file.kind === 'image'),
  );
  const trashed = $derived(note.status === 'trash');
  const pinned = $derived(note.pinnedAt !== null);
  // The note page edits in place; the editor replaces the rendered body.
  const editing = $derived(workspace.isEditing(note.id));
  const lifecycleBusy = $derived(!lifecycle.ready || lifecycle.busy);
  const items = $derived<ActionMenuItem[]>([
    {
      id: 'pin',
      label: pinned ? t('note.unpin') : t('note.pin'),
      icon: pinned ? 'pin-off' : 'pin',
      disabled: lifecycleBusy,
      onSelect: () => void lifecycle.run(note, pinned ? 'unpin' : 'pin'),
    },
    {
      id: 'edit',
      label: t('note.edit'),
      icon: 'pencil',
      disabled: !workspace.ready || workspace.busy || workspace.posting,
      onSelect: () => void startEdit(),
    },
    {
      id: 'delete',
      label: t('note.delete'),
      icon: 'trash',
      danger: true,
      disabled: lifecycleBusy,
      onSelect: () => void lifecycle.run(note, 'trash'),
    },
  ]);
  onMount(() => {
    ready = true;
  });
  onDestroy(() => workspace.releaseEdit(note.id));
  let wasEditing = false;
  $effect(() => {
    const now = editing;
    untrack(() => {
      const ended = wasEditing && !now;
      wasEditing = now;
      if (ended) void tick().then(() => menuTrigger?.focus());
    });
  });
  function date(value: number) {
    return new Date(value).toLocaleString('en', {
      timeZone: workspace.timezone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
  }
  async function startEdit() {
    editError = '';
    if (!(await workspace.editNote(note))) {
      editError = workspace.error;
      return;
    }
    await tick();
    await editor?.focusText();
  }
</script>

<section class="note-page" aria-label="Note detail">
  {#if trashed}
    <p><a href="/trash">← {t('note.backToTrash')}</a></p>
  {:else}
    <p><a href="/">← All notes</a></p>
  {/if}
  <article
    class="surface"
    data-testid="note-detail"
    data-note-id={note.id}
    data-revision={note.revision}
  >
    {#if trashed}<p class="trash-label" role="status">
        {t('note.inTrash')}
      </p>{:else}<div class="actions">
        {#if pinned}<button
            type="button"
            class="icon-button unpin"
            aria-label={t('note.unpinNote')}
            title={t('note.unpinNote')}
            disabled={!ready || lifecycleBusy}
            onclick={() => void lifecycle.run(note, 'unpin')}
            ><span class="when-rest"><Icon name="pin" /></span><span
              class="when-active"><Icon name="pin-off" /></span
            ></button
          >{/if}
        <ActionMenu
          label={t('note.actions')}
          {items}
          bind:trigger={menuTrigger}
        />
      </div>{/if}
    {#if editError}<p role="alert">{editError}</p>{/if}
    {#if !editing && workspace.status === 'Saved on server.'}<p role="status">
        Saved on server.
      </p>{/if}
    {#if editing}<NoteEditor variant="inline" bind:this={editor} />{/if}
    <div hidden={editing} inert={editing}>
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
    </div>
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
    justify-content: flex-end;
    margin-bottom: var(--space-3);
  }
  .trash-label {
    margin: 0 0 var(--space-3);
    color: var(--muted);
    font-weight: 650;
  }
  .unpin {
    color: var(--accent);
  }
  .unpin .when-active,
  .unpin:hover:not(:disabled) .when-rest,
  .unpin:focus-visible .when-rest {
    display: none;
  }
  .unpin:hover:not(:disabled) .when-active,
  .unpin:focus-visible .when-active {
    display: inline-grid;
  }
  .unpin .when-rest {
    display: inline-grid;
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
