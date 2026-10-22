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
  import { formatFileSize, isVoiceClip } from '#lib/shared/attachments.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  import type { RenderedMarkdown } from '#lib/shared/markdown/render.ts';
  import {
    cardImages,
    gridImages,
    selectTag,
    shortDate,
    stampDateTime,
  } from '#lib/shared/timeline.ts';
  import ThumbnailGrid from './ThumbnailGrid.svelte';
  import Markdown from './Markdown.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import Icon from './Icon.svelte';
  import LabelChip from './LabelChip.svelte';
  import { LABELS, type LabelsMap } from '#lib/client/labels-context.ts';
  import AudioClip from './AudioClip.svelte';
  import FileTypeIcon from './FileTypeIcon.svelte';
  import { canReturnInApp } from '#lib/client/history.ts';
  import { countWords } from '#lib/shared/word-count.ts';
  import NoteEditor from './NoteEditor.svelte';
  let {
    note,
    rendered,
    timezone,
  }: {
    note: NoteSnapshot;
    rendered?: RenderedMarkdown;
    timezone: string;
  } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  const labelsMap = getContext<LabelsMap | undefined>(LABELS);
  const i18n = useI18n();
  const t = i18n.t;
  let ready = $state(false);
  let editError = $state('');
  let selected = $state<string | null>(null);
  let editButton = $state<HTMLButtonElement>();
  let editor = $state<ReturnType<typeof NoteEditor>>();
  const images = $derived(
    (note.attachments ?? []).filter((file) => file.kind === 'image'),
  );
  const clips = $derived((note.attachments ?? []).filter(isVoiceClip));
  const plainFiles = $derived(
    (note.attachments ?? []).filter(
      (a) => a.kind === 'file' && !isVoiceClip(a),
    ),
  );
  const trashed = $derived(note.status === 'trash');
  const pinned = $derived(note.pinnedAt !== null);
  const label = $derived(
    note.labelId ? labelsMap?.get(note.labelId) : undefined,
  );
  // The note page edits in place; the editor replaces the rendered body.
  const editing = $derived(workspace.isEditing(note.id));
  const lifecycleBusy = $derived(!lifecycle.ready || lifecycle.busy);
  const when = $derived(new Date(note.timelineAt));
  const wordCount = $derived(countWords(note.bodyMarkdown));
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
      if (ended) void tick().then(() => editButton?.focus());
    });
  });
  // Return to the view we came from (All notes or a filtered list) when the
  // app navigated here; a direct visit falls back to All notes.
  function back(event: MouseEvent) {
    if (!canReturnInApp()) return;
    event.preventDefault();
    history.back();
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

<section class="note-page" aria-label={t('note.detail')}>
  <article
    class="surface"
    data-testid="note-detail"
    data-note-id={note.id}
    data-revision={note.revision}
    style:background={label?.background
      ? `var(--label-${label.background}-bg)`
      : undefined}
  >
    <header
      class:has-tags={note.tags.length > 0}
      style:--header-background={label?.headerColor
        ? `var(--label-${label.headerColor}-bg)`
        : label?.background
          ? `var(--label-${label.background}-bg)`
          : undefined}
      style:background={label?.headerColor
        ? `var(--label-${label.headerColor}-bg)`
        : undefined}
      style:color={label?.headerColor
        ? `var(--label-${label.headerColor}-fg)`
        : undefined}
    >
      <div class="header-date">
        <span class="when-wrap">
          <a
            class="when"
            href={`/notes/${note.id}`}
            aria-describedby={`when-info-${note.id}`}
            ><time datetime={when.toISOString()}
              >{shortDate(
                note.timelineAt,
                timezone,
                undefined,
                i18n.locale,
              )}</time
            ></a
          >
          <span class="when-info" id={`when-info-${note.id}`} role="tooltip"
            ><span
              >{t('note.created')}
              {stampDateTime(note.createdAt, timezone)}</span
            ><span
              >{t('note.updated')}
              {stampDateTime(note.updatedAt, timezone)}</span
            ></span
          >
        </span>
        <span class="word-count">{t('note.words', { count: wordCount })}</span>
      </div>
      {#if label}<div class="header-label"><LabelChip {label} /></div>{/if}
      {#if trashed}<div class="header-actions">
          <button
            type="button"
            class="icon-button"
            aria-label={t('note.restore')}
            title={t('note.restore')}
            disabled={!lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note, 'restore')}
            ><Icon name="restore" /></button
          >
          <button
            type="button"
            class="icon-button danger"
            aria-label={t('note.deletePermanently')}
            title={t('note.deletePermanently')}
            disabled={!lifecycle.ready || lifecycle.busy}
            onclick={() => lifecycle.choose(note, 'permanent-delete')}
            ><Icon name="delete-forever" /></button
          >
          <a
            class="icon-button back"
            href="/trash"
            aria-label={t('note.back')}
            title={t('note.back')}
            onclick={back}><Icon name="back" /></a
          >
        </div>{:else}<div class="header-actions">
          <button
            type="button"
            class="icon-button pin-toggle"
            class:unpin={pinned}
            aria-label={pinned ? t('note.unpinNote') : t('note.pin')}
            title={pinned ? t('note.unpinNote') : t('note.pin')}
            disabled={!ready || lifecycleBusy}
            onclick={() => void lifecycle.run(note, pinned ? 'unpin' : 'pin')}
            ><span class="when-rest"><Icon name="pin" /></span><span
              class="when-active"><Icon name="pin-off" /></span
            ></button
          >
          <button
            type="button"
            class="icon-button"
            aria-label={t('note.edit')}
            title={t('note.edit')}
            bind:this={editButton}
            disabled={!workspace.ready || workspace.busy || workspace.posting}
            onclick={() => void startEdit()}><Icon name="pencil" /></button
          >
          <button
            type="button"
            class="icon-button"
            aria-label={t('note.delete')}
            title={t('note.delete')}
            disabled={lifecycleBusy}
            onclick={() => void lifecycle.run(note, 'trash')}
            ><Icon name="trash" /></button
          >
          <a
            class="icon-button back"
            href="/"
            aria-label={t('note.back')}
            title={t('note.back')}
            onclick={back}><Icon name="back" /></a
          >
        </div>{/if}
    </header>
    {#if note.tags.length}<ul class="note-tags" aria-label={t('note.tags')}>
        {#each note.tags as tag (tag)}<li>
            <a href={selectTag({}, tag)}>#{tag}</a>
          </li>{/each}
      </ul>{/if}
    {#if editError}<p role="alert">{editError}</p>{/if}
    {#if !editing && workspace.status === 'saved'}<p role="status">
        {t('note.savedOnServer')}
      </p>{/if}
    {#if editing}<NoteEditor variant="inline" bind:this={editor} />{/if}
    <div hidden={editing} inert={editing}>
      <div
        class="note-body"
        style:font-family={label?.font
          ? `var(--font-${label.font === 'mono' ? 'code' : label.font})`
          : undefined}
      >
        <Markdown
          source={note.bodyMarkdown}
          images={cardImages(note)}
          initial={rendered}
          foreground
          onImage={(id) => {
            selected = id;
          }}
        />
      </div>
      <ThumbnailGrid
        images={gridImages(note)}
        disabled={!ready}
        onOpen={(id) => {
          selected = id;
        }}
      />
      {#if clips.length}
        <ul class="clips" aria-label={t('note.voiceClips')}>
          {#each clips as clip (clip.id)}<AudioClip
              id={clip.id}
              filename={clip.filename}
              suspended={editing}
            />{/each}
        </ul>
      {/if}
      <ul class="files" aria-label={t('note.attachments')}>
        {#each plainFiles as file (file.id)}{@const size = formatFileSize(
            file.storedBytes,
          )}
          <li>
            <a href={`/api/attachments/${file.id}/file`} download
              ><FileTypeIcon filename={file.filename} />{file.filename}</a
            >
            · {t(size.key, size.params)}
          </li>{/each}
      </ul>
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
  /* Date row and tags row read as one compact header block, as on timeline cards. */
  header {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    align-items: center;
    color: var(--muted);
    font-size: 0.875rem;
    margin-bottom: var(--space-3);
  }
  header.has-tags {
    margin-bottom: 0;
  }
  .header-actions {
    grid-column: 3;
    justify-self: end;
    display: flex;
    align-items: center;
  }
  .header-label {
    grid-column: 2;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .header-date {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  @media (max-width: 900px) {
    header {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .header-actions {
      grid-column: 2;
      grid-row: 1;
    }
    .header-label {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-self: center;
    }
  }
  /* Same pill geometry as the timeline card date and tag chips. */
  .header-actions :global(.icon-button) {
    width: auto;
    height: auto;
    min-height: var(--target);
    padding-inline: var(--space-3);
    border-radius: 999px;
  }
  @media (pointer: fine) {
    .header-actions :global(.icon-button) {
      min-height: 1.75rem;
    }
  }
  .when,
  .when:hover,
  .when time {
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .when {
    min-height: var(--target);
    padding-inline: var(--space-3);
    border-radius: 999px;
  }
  .when-wrap {
    position: relative;
    display: inline-flex;
  }
  /* Hover/focus details: shown only while the pointer or focus is on the date. */
  .when-info {
    display: none;
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 0;
    z-index: 10;
    flex-direction: column;
    gap: 0.125rem;
    padding: var(--space-2) var(--space-3);
    white-space: nowrap;
    font-size: 0.8125rem;
    color: #242b25;
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    pointer-events: none;
  }
  .when-wrap:hover .when-info,
  .when-wrap:focus-within .when-info {
    display: flex;
  }
  @media (pointer: fine) {
    .when {
      min-height: 1.75rem;
    }
  }
  .when time {
    position: relative;
    top: -0.0625rem;
  }
  .when:hover,
  .when:focus-visible {
    background: var(--header-background, var(--accent-soft));
  }
  .pin-toggle .when-rest {
    display: inline-grid;
  }
  .pin-toggle .when-active {
    display: none;
  }
  .pin-toggle.unpin {
    color: var(--accent);
  }
  .pin-toggle.unpin:hover:not(:disabled) .when-rest,
  .pin-toggle.unpin:focus-visible .when-rest {
    display: none;
  }
  .pin-toggle.unpin:hover:not(:disabled) .when-active,
  .pin-toggle.unpin:focus-visible .when-active {
    display: inline-grid;
  }
  .back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    text-decoration: none;
  }
  .word-count {
    white-space: nowrap;
  }
  .header-actions :global(.icon-button.danger) {
    color: var(--danger);
  }
  /* Hashtags are shown as the chips under the date; the body does not repeat them. */
  .note-body :global(.tag-text) {
    display: none;
  }
  .note-tags {
    display: flex;
    flex-wrap: wrap;
    list-style: none;
    gap: 0 var(--space-3);
    padding: 0;
    margin: 0 0 var(--space-3);
  }
  .note-tags a {
    display: flex;
    align-items: center;
    min-height: var(--target);
    max-width: 100%;
    padding-inline: var(--space-3);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .note-tags a:hover {
    text-decoration: underline;
  }
  @media (pointer: fine) {
    .note-tags a {
      min-height: 1.75rem;
    }
  }
  ul {
    padding-left: var(--space-4);
    overflow-wrap: anywhere;
  }
  li a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--target);
  }
  .files {
    list-style: none;
    padding: 0;
  }
  .clips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    margin: var(--space-2) 0;
    padding: 0;
  }
</style>
