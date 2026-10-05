<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import { pushState } from '$app/navigation';
  import {
    READING,
    type ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  const reading = getContext<ReadingState | undefined>(READING);
  import Markdown from './Markdown.svelte';
  import LocationPopover from './LocationPopover.svelte';
  import Modal from './Modal.svelte';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/drafts/lifecycle.svelte.ts';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  import {
    cardImages,
    toggleTag,
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
  let menuOpen = $state(false);
  let feedback = $state('');
  let disposed = false;
  const contentId = $props.id();
  const source = $derived(full?.revision === note.revision ? full : note);
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
  function openNote(event: MouseEvent, image?: string) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void pushState(`/notes/${note.id}`, {
      detailId: note.id,
      detailImage: image,
    });
  }
  async function copy() {
    menuOpen = false;
    try {
      let text = source.bodyMarkdown;
      if (note.bodyTruncated && !full) {
        const response = await fetch(`/api/notes/${note.id}`, {
          signal: AbortSignal.timeout(15_000),
        });
        const payload = (await response.json()) as ApiResult<NoteSnapshot>;
        if (!payload.ok) throw new Error(payload.error.message);
        text = payload.data.bodyMarkdown;
      }
      await navigator.clipboard.writeText(text);
      feedback = 'Markdown copied.';
    } catch {
      feedback = 'Copy failed. Use Show more and select the text to copy.';
    }
  }
  function choose(value: 'trash' | 'move-to-draft') {
    menuOpen = false;
    lifecycle.choose(note, value);
  }
</script>

<article
  class="surface note-card"
  data-testid="posted-note"
  data-note-id={note.id}
  data-revision={note.revision}
>
  <header>
    <time datetime={new Date(note.timelineAt).toISOString()}
      >{new Date(note.timelineAt).toLocaleString('en', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      })}</time
    >
    {#if note.contentEditedAt !== null}<span
        class="help"
        title={`Content edited ${new Date(note.contentEditedAt).toLocaleString('en', { timeZone: timezone })}`}
        >Edited</span
      >{/if}
    <a href={`/notes/${note.id}`} aria-label="Open note" onclick={openNote}
      >Open note</a
    >
    <button
      class="actions"
      aria-label="Note actions"
      aria-haspopup="dialog"
      disabled={!ready}
      onclick={() => {
        menuOpen = true;
      }}>•••</button
    >
  </header>
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
        void pushState(`/notes/${note.id}`, {
          detailId: note.id,
          detailImage: id,
        });
      }}
    />
  </div>
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
  {#if note.tags.length}<ul class="card-tags" aria-label="Note tags">
      {#each note.tags as tag (tag)}<li>
          <a
            href={toggleTag(filters, tag)}
            aria-current={filters.tags.includes(tag) ? 'true' : undefined}
            >#{tag}</a
          >
        </li>{/each}
    </ul>{/if}
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
  {#if feedback}<p role="status">{feedback}</p>{/if}
</article>
<Modal bind:open={menuOpen} title="Note actions">
  <button onclick={copy}>Copy Markdown</button>
  <button onclick={() => choose('move-to-draft')}>Move to Drafts</button>
  <button class="danger" onclick={() => choose('trash')}>Move to Trash</button>
</Modal>

<style>
  .note-card {
    min-width: 0;
  }
  header {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--muted);
    font-size: 0.875rem;
    margin-bottom: var(--space-3);
  }
  .actions {
    margin-left: auto;
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
  .card-content.expanded {
    max-height: none;
    overflow: visible;
  }
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    list-style: none;
    gap: var(--space-2);
    padding: 0;
    margin-bottom: 0;
  }
  .card-tags a {
    display: flex;
    align-items: center;
    min-height: var(--target);
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .card-tags a[aria-current='true'] {
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
