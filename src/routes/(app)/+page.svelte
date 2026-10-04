<script lang="ts">
  import { getContext, onMount, tick, untrack } from 'svelte';
  import {
    afterNavigate,
    beforeNavigate,
    invalidate,
    snapshot,
  } from '$app/navigation';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import NoteCard from '#lib/components/NoteCard.svelte';
  import {
    filterKey,
    filterHref,
    mergeCards,
    monthKey,
    snapshotCard,
    type TimelineCard,
    type TimelinePage,
  } from '#lib/shared/timeline.ts';
  import {
    captureAnchor,
    restoreAnchor,
    type ScrollAnchor,
  } from '#lib/client/timeline/scroll.ts';
  import type {
    ApiResult,
    MutationResult,
    NoteSnapshot,
  } from '#lib/shared/domain.ts';
  let { data } = $props();
  const workspace = getContext<DraftWorkspace>(DRAFT_WORKSPACE);
  let items = $state<TimelineCard[]>(untrack(() => data.timeline?.items ?? []));
  let nextCursor = $state<string | null>(
    untrack(() => data.timeline?.nextCursor ?? null),
  );
  let filters = $state(untrack(() => data.timeline?.filters ?? { tags: [] }));
  let expanded = $state<string[]>([]);
  let loading = $state(false);
  let error = $state('');
  let topMonth = $state('');
  let savedOutsideRange = $state(false);
  let scroller: HTMLElement;
  let sentinel: HTMLDivElement;
  let mounted = $state(false);
  let request: AbortController | undefined;
  let generation = 0;
  let loadedKey = untrack(() => filterKey(filters));
  let restored = false;
  let disposed = false;
  let handledSave = untrack(() => workspace.saved?.serial ?? 0);
  let restore: ScrollAnchor | null = null;
  function cancel() {
    generation++;
    request?.abort();
    request = undefined;
    loading = false;
  }
  beforeNavigate(cancel);
  afterNavigate(({ type }) => {
    if (scroller && type !== 'popstate') scroller.scrollTop = 0;
    restored = false;
  });
  snapshot({
    id: 'published-timeline-v1',
    capture: () => ({
      items: $state.snapshot(items),
      nextCursor,
      filters: $state.snapshot(filters),
      expanded: [...expanded],
      anchor: scroller ? captureAnchor(scroller) : null,
    }),
    restore: (value) => {
      cancel();
      restored = true;
      loadedKey = filterKey(value.filters);
      items = value.items;
      nextCursor = value.nextCursor;
      filters = value.filters;
      expanded = value.expanded;
      restore = value.anchor;
      void tick().then(() => {
        if (scroller && restore) {
          restoreAnchor(scroller, restore);
          restore = null;
        }
      });
    },
  });
  $effect(() => {
    const initial = data.timeline;
    untrack(() => {
      cancel();
      error = '';
      if (!initial) {
        items = [];
        nextCursor = null;
        return;
      }
      const key = filterKey(initial.filters);
      const same = key === loadedKey;
      const anchor = mounted && same ? captureAnchor(scroller) : null;
      filters = initial.filters;
      // Same-filter invalidation retains fetched older pages and their scroll context.
      // Known mutations remove/reconcile their own ID before this refresh.
      items = same ? mergeCards(items, initial.items) : initial.items;
      if (!same || items.length <= initial.items.length)
        nextCursor = initial.nextCursor;
      loadedKey = key;
      if (!same) {
        expanded = [];
        restored = false;
      }
      void tick().then(() => {
        if (!mounted) return;
        if (anchor) restoreAnchor(scroller, anchor);
        else if (!restored) scroller.scrollTop = 0;
      });
    });
  });
  $effect(() => {
    const saved = workspace.saved;
    if (saved && saved.serial > handledSave) {
      handledSave = saved.serial;
      untrack(() => {
        const changed = saved.snapshot;
        if (!changed) {
          mutation(saved.result);
          return;
        }
        const key = filterKey(filters);
        const anchor = mounted ? captureAnchor(scroller) : null;
        const alreadyLoaded = changed && items.some((n) => n.id === changed.id);
        const oldest = items.at(-1);
        // Never invent a gap in a partially loaded list just to display a save.
        const withinLoadedDates =
          !nextCursor ||
          !oldest ||
          (changed &&
            (changed.timelineAt > oldest.timelineAt ||
              (changed.timelineAt === oldest.timelineAt &&
                changed.id >= oldest.id)));
        const matches =
          changed?.status === 'published' &&
          filters.tags.every((tag) => changed.tags.includes(tag));
        savedOutsideRange = !matches || (!alreadyLoaded && !withinLoadedDates);
        if (changed) items = items.filter((n) => n.id !== changed.id);
        void (async () => {
          if (changed && matches && (alreadyLoaded || withinLoadedDates)) {
            try {
              const card = await snapshotCard(changed);
              if (disposed || key !== filterKey(filters)) return;
              items = mergeCards(items, [card]);
              await tick();
              if (anchor && mounted) restoreAnchor(scroller, anchor);
            } catch {
              /* The authoritative save still succeeded; SSR refresh can retry rendering. */
            }
          }
          if (!disposed) await invalidate('pandanote:timeline');
        })();
      });
    }
  });
  onMount(() => {
    scroller = sentinel.closest('#notes-pane') as HTMLElement;
    mounted = true;
    if (restore) {
      restoreAnchor(scroller, restore);
      restore = null;
    }
    let scheduled = 0;
    // IO registers cards relative to the real scroller. The scroll callback then
    // resolves the actual top crossing, including very tall cards, not page index.
    const track = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        const anchor = captureAnchor(scroller);
        const note = items.find((n) => n.id === anchor.id);
        if (note) topMonth = monthKey(note.timelineAt, workspace.timezone);
      });
    };
    const observer = new IntersectionObserver(track, {
      root: scroller,
      threshold: [0, 0.01, 1],
    });
    const watch = () => {
      observer.disconnect();
      scroller
        .querySelectorAll('[data-note-id]')
        .forEach((card) => observer.observe(card));
      track();
    };
    const mutations = new MutationObserver(watch);
    mutations.observe(scroller, { childList: true, subtree: true });
    scroller.addEventListener('scroll', track, { passive: true });
    watch();
    return () => {
      disposed = true;
      cancel();
      observer.disconnect();
      mutations.disconnect();
      scroller.removeEventListener('scroll', track);
      cancelAnimationFrame(scheduled);
    };
  });
  $effect(() => {
    if (!mounted || !nextCursor || loading || error || data.timelineError)
      return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        // IO delivery can be queued before history restores a longer DOM. Do not
        // load a new page from a now-stale intersection after disconnect/restore.
        if (
          active &&
          entries.some((entry) => entry.isIntersecting) &&
          sentinel.getBoundingClientRect().top <=
            scroller.getBoundingClientRect().bottom + 160
        )
          void untrack(loadOlder);
      },
      { root: scroller, rootMargin: '0px 0px 160px 0px' },
    );
    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  });
  async function loadOlder() {
    if (!nextCursor || loading || disposed) return;
    const cursor = nextCursor;
    const key = filterKey(filters);
    const current = ++generation;
    request?.abort();
    request = new AbortController();
    const timer = setTimeout(() => request?.abort(), 15_000);
    loading = true;
    error = '';
    try {
      const params = new URL(filterHref(filters), window.location.origin)
        .searchParams;
      params.set('cursor', cursor);
      const response = await fetch(`/api/notes?${params}`, {
        signal: request.signal,
      });
      const payload = (await response.json()) as ApiResult<TimelinePage>;
      if (current !== generation || key !== filterKey(filters) || disposed)
        return;
      if (!payload.ok) throw new Error(payload.error.message);
      if (filterKey(payload.data.filters) !== key)
        throw new Error('Filters changed. Start from the first page.');
      const anchor = captureAnchor(scroller);
      items = mergeCards(items, payload.data.items);
      nextCursor = payload.data.nextCursor;
      await tick();
      if (current === generation && key === filterKey(filters) && !disposed)
        restoreAnchor(scroller, anchor);
    } catch (failure) {
      if (current === generation && !disposed)
        error =
          failure instanceof Error && failure.name !== 'AbortError'
            ? failure.message
            : 'Older notes could not be loaded. Retry without losing your place.';
    } finally {
      clearTimeout(timer);
      if (current === generation) loading = false;
    }
  }
  function expansion(id: string, value: boolean) {
    if (!value && mounted) {
      const card = scroller.querySelector<HTMLElement>(
        `[data-note-id="${id}"]`,
      );
      if (
        card &&
        card.getBoundingClientRect().top < scroller.getBoundingClientRect().top
      )
        scroller.scrollTop +=
          card.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
    }
    expanded = value ? [...expanded, id] : expanded.filter((n) => n !== id);
  }
  function mutation(result: MutationResult) {
    const anchor = captureAnchor(scroller);
    if (result.status !== 'published' || result.deleted)
      items = items.filter((n) => n.id !== result.noteId);
    const key = filterKey(filters);
    void (async () => {
      if (result.status === 'published' && !result.deleted) {
        try {
          const response = await fetch(`/api/notes/${result.noteId}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const payload = (await response.json()) as ApiResult<NoteSnapshot>;
          if (payload.ok && !disposed && key === filterKey(filters)) {
            const card = await snapshotCard(payload.data);
            if (disposed || key !== filterKey(filters)) return;
            const oldest = items.at(-1);
            const visibleRange =
              items.some((n) => n.id === card.id) ||
              !nextCursor ||
              !oldest ||
              card.timelineAt > oldest.timelineAt ||
              (card.timelineAt === oldest.timelineAt && card.id >= oldest.id);
            items = items.filter((n) => n.id !== result.noteId);
            const matches =
              card.status === 'published' &&
              filters.tags.every((tag) => card.tags.includes(tag));
            if (matches && visibleRange) items = mergeCards(items, [card]);
            if (workspace.saved?.result.noteId === card.id)
              savedOutsideRange = !matches || !visibleRange;
          }
        } catch {
          error =
            'The latest note could not be loaded. Retry Refresh timeline.';
        }
      }
      if (!disposed) {
        await invalidate('pandanote:timeline');
        if (key === filterKey(filters) && !disposed)
          restoreAnchor(scroller, anchor);
      }
    })();
  }
</script>

<svelte:head
  ><title>All notes — PandaNote</title><meta
    name="description"
    content="Your private personal notebook"
  /></svelte:head
>
<div class="timeline-status" data-top-month={topMonth}>
  <h1 class="sr-only">All notes</h1>
  <span class="sr-only">You are signed in.</span>
  {#if workspace.status === 'Saved on server.'}<p role="status">
      Saved on server.
    </p>
    {#if savedOutsideRange}<p class="help">
        This note is outside the current filters or loaded dates. Clear filters
        or load older notes to find it.
      </p>{/if}{/if}
  {#if data.timelineError}<section class="surface">
      <p role="alert">{data.timelineError}</p>
      <button onclick={() => invalidate('pandanote:timeline')}
        >Retry timeline</button
      ><a href="/">Clear filters and start again</a>
    </section>{/if}
</div>
{#if !items.length && !data.timelineError}
  <section class="surface">
    <h2>
      {filters.tags.length ? 'No matching notes' : 'A quiet place to begin'}
    </h2>
    <p>
      {filters.tags.length
        ? 'No published notes match every selected tag. Remove a filter or clear all.'
        : 'Write your first note above. Published notes will appear here.'}
    </p>
  </section>
{/if}
{#each items as note, index (note.id)}
  {#if index === 0 || monthKey(items[index - 1].timelineAt, workspace.timezone) !== monthKey(note.timelineAt, workspace.timezone)}
    <h2
      class="month-separator"
      data-month={monthKey(note.timelineAt, workspace.timezone)}
    >
      {new Date(note.timelineAt).toLocaleString('en', {
        timeZone: workspace.timezone,
        month: 'long',
        year: 'numeric',
      })}
    </h2>
  {/if}
  <NoteCard
    {note}
    {filters}
    timezone={workspace.timezone}
    expanded={expanded.includes(note.id)}
    onExpansion={expansion}
    onMutation={mutation}
  />
{/each}
<div class="paging" bind:this={sentinel} aria-live="polite">
  {#if loading}<p role="status">Loading older notes…</p>
  {:else if error}<p role="alert">{error}</p>
    <button onclick={loadOlder}>Retry older notes</button><button
      onclick={() => invalidate('pandanote:timeline')}>Refresh timeline</button
    >
  {:else if nextCursor}<button onclick={loadOlder}>Load older notes</button>
  {:else if items.length}<p class="help">You’ve reached the beginning.</p>{/if}
</div>

<style>
  .timeline-status:empty {
    display: none;
  }
  .timeline-status p {
    margin: 0;
  }
  .month-separator {
    font-size: 1rem;
    color: var(--muted);
    margin: var(--space-2) 0 0;
  }
  .paging {
    /* Paging controls move below appended cards; never anchor the viewport to
       the focused Retry/Load button instead of the current reading card. */
    overflow-anchor: none;
    min-height: var(--target);
    text-align: center;
    padding: var(--space-3);
  }
</style>
