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
  import LocationPopover from './LocationPopover.svelte';
  import ActionMenu, { type ActionMenuItem } from './ActionMenu.svelte';
  import Icon from './Icon.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const { t } = useI18n();
  import {
    cardImages,
    gridImages,
    selectTag,
    shortDate,
    type TimelineCard,
    type TimelineFilters,
  } from '#lib/shared/timeline.ts';
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
    return () => {
      disposed = true;
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
        if (!payload.ok) throw new Error(payload.error.message);
        if (disposed) return;
        if (
          payload.data.status !== 'published' ||
          payload.data.revision !== note.revision
        )
          throw new Error(
            'This note changed. Refresh the timeline before expanding it.',
          );
        full = payload.data;
      } catch (failure) {
        if (!disposed)
          error =
            failure instanceof Error
              ? failure.message
              : 'Note could not be loaded. Retry Show more.';
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
  // Leaving edit mode (save or cancel) returns focus to this card's trigger.
  let wasEditing = false;
  $effect(() => {
    const now = editing;
    untrack(() => {
      const ended = wasEditing && !now;
      wasEditing = now;
      if (ended) void tick().then(() => menuTrigger?.focus());
    });
  });
  onDestroy(() => workspace.releaseEdit(note.id));
</script>

<article
  class="surface note-card"
  data-testid="posted-note"
  data-note-id={note.id}
  data-revision={note.revision}
>
  {#if editing}<NoteEditor variant="inline" bind:this={editor} />{/if}
  <div class="card-view" hidden={editing} inert={editing}>
    <header class:has-tags={note.tags.length > 0}>
      <a
        class="when"
        href={`/notes/${note.id}`}
        title={new Date(note.timelineAt).toLocaleString('en', {
          timeZone: timezone,
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
        ><time datetime={new Date(note.timelineAt).toISOString()}
          >{shortDate(note.timelineAt, timezone)}</time
        ></a
      >
      <div class="header-actions">
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
      <section
        class="search-snippets"
        aria-label="Search excerpts (normalized text)"
      >
        <span class="help">Search excerpts · normalized text</span>
        {#each note.snippets as snippet, index (index)}
          <p>
            <span class="muted"
              >{snippet.field === 'body'
                ? 'Source'
                : snippet.field === 'tag'
                  ? 'Tag'
                  : 'Filename'}:
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
    {#if note.bodyTruncated && source === note}<p class="help">
        Long note preview · full content loads on expansion.
      </p>{/if}
    {#if collapsePreference && (overflow || note.bodyTruncated || expanded)}
      <button
        aria-expanded={expanded}
        aria-controls={contentId}
        disabled={loading || !ready}
        onclick={expand}
        >{loading
          ? 'Loading full note…'
          : expanded
            ? 'Show less'
            : 'Show more'}</button
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
            })}>Refresh</button
        >
      </p>{/if}
    {#if note.location}<LocationPopover location={note.location} />{/if}
    {#if (note.attachments ?? []).some((a) => a.kind === 'file')}
      <ul class="files" aria-label="Attachments">
        {#each (note.attachments ?? []).filter((a) => a.kind === 'file') as file (file.id)}<li
          >
            <a href={`/api/attachments/${file.id}/file`} download
              >{file.filename}</a
            ><span class="help">{file.storedBytes} bytes</span>
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
  .note-card {
    min-width: 0;
  }
  /* Date row and tags row read as one compact header block. */
  header {
    display: flex;
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
    margin-left: auto;
    display: flex;
    align-items: center;
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
    overflow-wrap: anywhere;
    min-width: 0;
  }
</style>
