<script lang="ts">
  import { getContext, onDestroy, onMount, tick, untrack } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import {
    READING,
    type ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  const reading = getContext<ReadingState | undefined>(READING);
  import Markdown from './Markdown.svelte';
  import ThumbnailGrid from './ThumbnailGrid.svelte';
  import ActionMenu, { type ActionMenuItem } from './ActionMenu.svelte';
  import Icon from './Icon.svelte';
  import AudioClip from './AudioClip.svelte';
  import FileTypeIcon from './FileTypeIcon.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const i18n = useI18n();
  const t = i18n.t;
  import {
    cardImages,
    gridImages,
    selectTag,
    shortDate,
    stampDateTime,
    type TimelineCard,
    type TimelineFilters,
  } from '#lib/shared/timeline.ts';
  import { formatFileSize, isVoiceClip } from '#lib/shared/attachments.ts';
  import type {
    ApiResult,
    MutationResult,
    NoteSnapshot,
  } from '#lib/shared/domain.ts';
  let {
    note,
    filters,
    timezone,
    expanded = false,
    onExpansion = () => {},
    onMutation = () => {},
  }: {
    note: TimelineCard;
    filters: TimelineFilters;
    timezone: string;
    expanded?: boolean;
    onExpansion?: (id: string, expanded: boolean) => void;
    onMutation?: (result: MutationResult) => void;
  } = $props();
  let content: HTMLDivElement;
  let article: HTMLElement;
  let overflow = $state(false);
  let ready = $state(false);
  let collapsePreference = $state(true);
  let visible = $state(false);
  let full = $state<NoteSnapshot | null>(null);
  let loading = $state(false);
  let error = $state('');
  let menuTrigger = $state<HTMLButtonElement>();
  let editor = $state<ReturnType<typeof NoteEditor>>();
  let selectedImage = $state<string | null>(null);
  let disposed = false;
  const contentId = $props.id();
  const source = $derived(full?.revision === note.revision ? full : note);
  const readyImages = $derived(
    (source.attachments ?? []).filter((file) => file.kind === 'image'),
  );
  const clips = $derived((source.attachments ?? []).filter(isVoiceClip));
  const plainFiles = $derived(
    (source.attachments ?? []).filter(
      (a) => a.kind === 'file' && !isVoiceClip(a),
    ),
  );
  $effect(() => {
    const revision = note.revision;
    untrack(() => {
      if (full && full.revision !== revision) full = null;
    });
  });
  onMount(() => {
    ready = true;
    const measure = () => {
      overflow = content.scrollHeight > content.clientHeight + 2;
      const bottom = content.getBoundingClientRect().bottom;
      // Clipped controls must not be tabbable or accessible until Show more.
      content
        .querySelectorAll<HTMLElement>('a, button, [tabindex]')
        .forEach((node) => {
          node.inert = overflow && node.getBoundingClientRect().top >= bottom;
        });
    };
    const preference = () => {
      collapsePreference =
        document.documentElement.dataset.collapse !== 'false';
      measure();
    };
    const observer = new ResizeObserver(measure);
    const changes = new MutationObserver(measure);
    changes.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tabindex'],
    });
    const appearance = new MutationObserver(preference);
    appearance.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-collapse'],
    });
    const visibility = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { root: content.closest('#notes-pane') },
    );
    visibility.observe(content);
    observer.observe(content);
    observer.observe(content.firstElementChild!);
    preference();
    content.addEventListener('dblclick', editFromText);
    return () => {
      disposed = true;
      content.removeEventListener('dblclick', editFromText);
      observer.disconnect();
      changes.disconnect();
      appearance.disconnect();
      visibility.disconnect();
    };
  });
  async function loadFull() {
    if (loading || disposed) return;
    error = '';
    if (note.bodyTruncated && !full) {
      loading = true;
      try {
        const response = await fetch(`/api/notes/${note.id}`, {
          signal: AbortSignal.timeout(15_000),
        });
        const payload = (await response.json()) as ApiResult<NoteSnapshot>;
        if (!payload.ok) throw new Error(i18n.error(payload.error));
        if (disposed) return;
        if (
          payload.data.status !== 'published' ||
          payload.data.revision !== note.revision
        )
          throw new Error(t('note.changed'));
        full = payload.data;
      } catch (failure) {
        if (!disposed)
          error =
            failure instanceof Error ? failure.message : t('note.loadFailed');
      } finally {
        if (!disposed) loading = false;
      }
      if (!full || disposed) return;
    }
  }
  async function expand() {
    if (expanded) {
      onExpansion(note.id, false);
      return;
    }
    await loadFull();
    if ((!note.bodyTruncated || full) && !disposed) onExpansion(note.id, true);
  }
  // Full preference/history expansion resolves large source only when visible,
  // never by fetching every offscreen full note during initial hydration.
  $effect(() => {
    if (
      !reading?.paused &&
      visible &&
      (expanded || !collapsePreference) &&
      note.bodyTruncated
    )
      void untrack(loadFull);
  });
  const pinned = $derived(note.pinnedAt !== null);
  // This card renders the workspace's one editor session while it edits this note.
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
  async function startEdit() {
    error = '';
    // A click outside another inline edit may still be saving it.
    if (workspace.autosave && !(await workspace.autosave)) return;
    let snapshot: NoteSnapshot = note;
    if (note.bodyTruncated) {
      await loadFull();
      const loaded = full as NoteSnapshot | null;
      if (!loaded) return;
      snapshot = loaded;
    }
    // The unsaved-changes guard runs inside editNote; Cancel keeps everything.
    if (!(await workspace.editNote(snapshot))) {
      error = workspace.error;
      return;
    }
    await tick();
    await editor?.focusText();
  }
  /** Double-clicking the note text edits it in place; links, images and controls
   * inside the text keep their own behavior. */
  function editFromText(event: MouseEvent) {
    const target = event.target as Element | null;
    if (
      editing ||
      !ready ||
      target?.closest('a, button, img, input, audio, video, label, summary')
    )
      return;
    window.getSelection()?.removeAllRanges();
    void startEdit();
  }
  /** Pointer down on a scroll container's own scrollbar is scrolling, not a click. */
  function onScrollbar(event: PointerEvent, target: Element) {
    return (
      (target.clientWidth > 0 && event.offsetX > target.clientWidth) ||
      (target.clientHeight > 0 && event.offsetY > target.clientHeight)
    );
  }
  // Clicking anywhere outside the card saves a changed edit (or closes an unchanged
  // one) without asking. Dialogs (focus mode, pickers, conflicts) are not "outside".
  let closedOutside = false;
  $effect(() => {
    if (!editing) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        event.button !== 0 ||
        !(target instanceof Element) ||
        article.contains(target) ||
        target.closest('dialog') ||
        onScrollbar(event, target)
      )
        return;
      closedOutside = true;
      void workspace.commitEdit().then((done) => {
        if (!done) closedOutside = false;
      });
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });
  // Leaving edit mode (save or cancel) returns focus to this card's trigger, unless
  // the user left by clicking elsewhere: focus then stays where they clicked.
  let wasEditing = false;
  $effect(() => {
    const now = editing;
    untrack(() => {
      const ended = wasEditing && !now;
      wasEditing = now;
      if (ended && !closedOutside) void tick().then(() => menuTrigger?.focus());
      if (ended || now) closedOutside = false;
    });
  });
  onDestroy(() => workspace.releaseEdit(note.id));
</script>

<article
  bind:this={article}
  class="surface note-card"
  data-testid="posted-note"
  data-note-id={note.id}
  data-revision={note.revision}
>
  {#if editing}<NoteEditor variant="inline" bind:this={editor} />{/if}
  <div class="card-view" hidden={editing} inert={editing}>
    <header class:has-tags={note.tags.length > 0}>
      <span class="when-wrap">
        <a
          class="when"
          href={`/notes/${note.id}`}
          aria-describedby={`when-info-${note.id}`}
          ><time datetime={new Date(note.timelineAt).toISOString()}
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
            >{t('note.created')} {stampDateTime(note.createdAt, timezone)}</span
          ><span
            >{t('note.updated')} {stampDateTime(note.updatedAt, timezone)}</span
          ></span
        >
      </span>
      <div class="header-actions">
        {#if note.isPrivate}<span
            aria-label={t('vault.private')}
            title={t('vault.private')}><Icon name="lock" /></span
          >{/if}
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
      </div>
    </header>
    {#if note.tags.length}<ul class="card-tags" aria-label={t('note.tags')}>
        {#each note.tags as tag (tag)}<li>
            <a
              href={selectTag(filters, tag)}
              aria-current={filters.tag === tag ? 'true' : undefined}>#{tag}</a
            >
          </li>{/each}
      </ul>{/if}
    {#if note.snippets?.length}
      <section class="search-snippets" aria-label={t('note.searchExcerpts')}>
        <span class="help">{t('note.searchExcerptsHelp')}</span>
        {#each note.snippets as snippet, index (index)}
          <p>
            <span class="muted"
              >{snippet.field === 'body'
                ? t('note.snippetSource')
                : snippet.field === 'tag'
                  ? t('note.snippetTag')
                  : t('note.snippetFile')}:
            </span>{#each snippet.segments as segment, part (part)}{#if segment.highlighted}<mark
                  >{segment.text}</mark
                >{:else}{segment.text}{/if}{/each}
          </p>
        {/each}
      </section>
    {/if}
    <div id={contentId} class="card-content" class:expanded bind:this={content}>
      <Markdown
        source={source.bodyMarkdown}
        images={cardImages(source)}
        initial={source === note ? note.rendered : undefined}
        allowCodeCopy={source !== note || !note.bodyTruncated}
        onImage={(id) => {
          selectedImage = id;
        }}
      />
    </div>
    <ThumbnailGrid
      images={gridImages(source)}
      disabled={!ready}
      onOpen={(id) => {
        selectedImage = id;
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
    {#if note.bodyTruncated && source === note}<p class="help">
        {t('note.preview')}
      </p>{/if}
    {#if collapsePreference && (overflow || note.bodyTruncated || expanded)}
      <button
        aria-expanded={expanded}
        aria-controls={contentId}
        disabled={loading || !ready}
        onclick={expand}
        >{loading
          ? t('note.loadingFull')
          : expanded
            ? t('note.showLess')
            : t('note.showMore')}</button
      >
    {/if}
    {#if error}<p role="alert">
        {error}
        <button
          onclick={() =>
            onMutation({
              noteId: note.id,
              revision: note.revision,
              status: 'published',
              deleted: false,
            })}>{t('note.refresh')}</button
        >
      </p>{/if}
    {#if plainFiles.length}
      <ul class="files" aria-label={t('note.attachments')}>
        {#each plainFiles as file (file.id)}{@const size = formatFileSize(
            file.storedBytes,
          )}
          <li>
            <a href={`/api/attachments/${file.id}/file`} download
              ><FileTypeIcon filename={file.filename} />{file.filename}</a
            ><span class="help">{t(size.key, size.params)}</span>
          </li>{/each}
      </ul>
    {/if}
  </div>
</article>
{#if selectedImage && readyImages.some((image) => image.id === selectedImage)}
  <ImageViewer
    images={readyImages}
    selected={selectedImage}
    onClose={() => {
      selectedImage = null;
    }}
  />
{/if}

<style>
  .clips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  .note-card {
    min-width: 0;
  }
  /* Date row and tags row read as one compact header block. */
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
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
    grid-column: 2;
    justify-self: end;
    display: flex;
    align-items: center;
  }
  @media (max-width: 600px) {
    header {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .header-actions {
      grid-column: 2;
      grid-row: 1;
    }
  }
  /* Actions use the same pill as the date and tag chips, not a circle. */
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
  /* Same pill geometry as .card-tags a so the hover chips line up. */
  .when {
    padding-inline: var(--space-3);
    border-radius: 999px;
  }
  @media (pointer: fine) {
    .when {
      min-height: 1.75rem;
    }
  }
  .when time {
    /* Optically centred on the ••• trigger: text boxes include descender space. */
    position: relative;
    top: -0.0625rem;
  }
  .when:hover,
  .when:focus-visible {
    background: var(--accent-soft);
  }
  .search-snippets {
    overflow-wrap: anywhere;
    font-size: 0.875rem;
    border-left: 2px solid var(--accent);
    padding-left: var(--space-2);
  }
  .search-snippets p {
    margin: var(--space-2) 0;
    white-space: pre-wrap;
  }
  mark {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 650;
  }
  .card-content {
    max-height: var(--collapsed-height);
    overflow: hidden;
    min-width: 0;
  }
  /* Hashtags are shown as the chips above; the card does not repeat their text. */
  .card-content :global(.tag-text) {
    display: none;
  }
  .card-content.expanded {
    max-height: none;
    overflow: visible;
  }
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    list-style: none;
    gap: 0 var(--space-3);
    padding: 0;
    margin: 0 0 var(--space-2);
  }
  /* Same pill chip as the Tags menu: no underline until hovered. */
  .card-tags a {
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
  .card-tags a:hover {
    text-decoration: underline;
  }
  @media (pointer: fine) {
    /* Desktop: a tighter row; touch keeps the full --target hit area. */
    .card-tags a {
      min-height: 1.75rem;
    }
  }
  .card-tags a[aria-current='true'] {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 650;
  }
  .files {
    list-style: none;
    padding: 0;
  }
  .files li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2);
    align-items: center;
    border-top: 1px solid var(--border);
  }
  .files a {
    min-height: var(--target);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    overflow-wrap: anywhere;
    min-width: 0;
  }
</style>
