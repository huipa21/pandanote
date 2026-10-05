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
  import {
    CALENDAR,
    type CalendarState,
  } from '#lib/client/timeline/calendar.svelte.ts';
  import { localDate } from '#lib/shared/calendar.ts';
  import NoteCard from '#lib/components/NoteCard.svelte';
  import { matchesSearch, parseSearch } from '#lib/shared/search.ts';
  import type { TimelineFilters } from '#lib/shared/timeline.ts';
  function matchesFilters(
    note: NoteSnapshot,
    filters: TimelineFilters,
  ): boolean {
    return (
      note.status === 'published' &&
      filters.tags.every((tag) => note.tags.includes(tag)) &&
      (!filters.day ||
        (note.timelineAt >= filters.day.start &&
          note.timelineAt < filters.day.end)) &&
      matchesSearch(
        [
          note.bodyMarkdown,
          ...note.tags,
          ...(note.attachments ?? []).map((file) => file.filename),
        ],
        parseSearch(filters.query ?? ''),
      )
    );
  }
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
  const calendar = getContext<CalendarState>(CALENDAR);
  function queryKey(value: TimelineFilters) {
    return filterKey(value) + '|' + data.timezone;
  }
  let items = $state<TimelineCard[]>(untrack(() => data.timeline?.items ?? []));
  let nextCursor = $state<string | null>(
    untrack(() => data.timeline?.nextCursor ?? null),
  );
  let filters = $state(untrack(() => data.timeline?.filters ?? { tags: [] }));
  let expanded = $state<string[]>([]);
  let loading = $state(false);
  let error = $state('');
  let topMonth = $state('');
  let emptyMonth = $state(untrack(() => data.timeline?.emptyMonth ?? false));
  let followScroll = false;
  let savedOutsideRange = $state(false);
  let scroller: HTMLElement;
  let sentinel: HTMLDivElement;
  let mounted = $state(false);
  let request: AbortController | undefined;
  let generation = 0;
  let loadedKey = untrack(() => queryKey(filters));
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
  beforeNavigate(() => {
    followScroll = false;
    cancel();
  });
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
      calendarMonth: calendar.month,
      emptyMonth,
      timezone: data.timezone,
      anchor: scroller ? captureAnchor(scroller) : null,
    }),
    restore: (value) => {
      cancel();
      restored = true;
      if (value.timezone !== data.timezone) return;
      loadedKey = queryKey(value.filters);
      calendar.month = value.calendarMonth;
      emptyMonth = value.emptyMonth;
      followScroll = true;
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
      const key = queryKey(initial.filters);
      const same = key === loadedKey;
      const anchor = mounted && same ? captureAnchor(scroller) : null;
      filters = initial.filters;
      if (same && emptyMonth && !initial.emptyMonth) emptyMonth = false;
      // Same-filter invalidation retains fetched older pages and their scroll context.
      // Known mutations remove/reconcile their own ID before this refresh.
      items = same ? mergeCards(items, initial.items) : initial.items;
      if (!same || items.length <= initial.items.length)
        nextCursor = initial.nextCursor;
      loadedKey = key;
      if (!same) {
        emptyMonth = initial.emptyMonth ?? false;
        followScroll = false;
        calendar.month =
          initial.filters.date?.slice(0, 7) ??
          initial.filters.month ??
          localDate(Date.now(), data.timezone).slice(0, 7);
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
        const key = queryKey(filters);
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
          matchesFilters(changed, filters) &&
          (data.timeline?.anchor == null ||
            changed.timelineAt < data.timeline.anchor) &&
          (!emptyMonth ||
            monthKey(changed.timelineAt, data.timezone) === filters.month);
        savedOutsideRange = !matches || (!alreadyLoaded && !withinLoadedDates);
        if (changed) items = items.filter((n) => n.id !== changed.id);
        void (async () => {
          if (changed && matches && (alreadyLoaded || withinLoadedDates)) {
            try {
              const card = await snapshotCard(changed, filters.query);
              if (disposed || key !== queryKey(filters)) return;
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
        if (note && anchor.offset < scroller.clientHeight) {
          topMonth = monthKey(note.timelineAt, data.timezone);
          if (followScroll && !emptyMonth && !filters.day)
            calendar.month = topMonth;
        }
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
    const scrolling = () => {
      followScroll = true;
      track();
    };
    scroller.addEventListener('scroll', scrolling, { passive: true });
    watch();
    return () => {
      disposed = true;
      cancel();
      observer.disconnect();
      mutations.disconnect();
      scroller.removeEventListener('scroll', scrolling);
      cancelAnimationFrame(scheduled);
    };
  });
  $effect(() => {
    if (
      !mounted ||
      !nextCursor ||
      emptyMonth ||
      loading ||
      error ||
      data.timelineError
    )
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
    const key = queryKey(filters);
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
      if (current !== generation || key !== queryKey(filters) || disposed)
        return;
      if (!payload.ok) throw new Error(payload.error.message);
      if (queryKey(payload.data.filters) !== key)
        throw new Error('Filters changed. Start from the first page.');
      const anchor = captureAnchor(scroller);
      emptyMonth = false;
      followScroll = true;
      items = mergeCards(items, payload.data.items);
      nextCursor = payload.data.nextCursor;
      await tick();
      if (current === generation && key === queryKey(filters) && !disposed)
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
    const key = queryKey(filters);
    void (async () => {
      if (result.status === 'published' && !result.deleted) {
        try {
          const response = await fetch(`/api/notes/${result.noteId}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const payload = (await response.json()) as ApiResult<NoteSnapshot>;
          if (payload.ok && !disposed && key === queryKey(filters)) {
            const card = await snapshotCard(payload.data, filters.query);
            if (disposed || key !== queryKey(filters)) return;
            const oldest = items.at(-1);
            const visibleRange =
              items.some((n) => n.id === card.id) ||
              !nextCursor ||
              !oldest ||
              card.timelineAt > oldest.timelineAt ||
              (card.timelineAt === oldest.timelineAt && card.id >= oldest.id);
            items = items.filter((n) => n.id !== result.noteId);
            const matches =
              matchesFilters(payload.data, filters) &&
              (data.timeline?.anchor == null ||
                card.timelineAt < data.timeline.anchor) &&
              (!emptyMonth ||
                monthKey(card.timelineAt, data.timezone) === filters.month);
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
        if (key === queryKey(filters) && !disposed)
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
{#if emptyMonth && !items.length && !data.timelineError}
  <section class="surface" aria-label="Empty month">
    <h2>No matching notes in {filters.month}</h2>
    <p>This selected month is empty. Your search and tags are retained.</p>
    {#if nextCursor}<button onclick={loadOlder}>Load older notes</button>{/if}
    <a
      href={filterHref({
        tags: filters.tags,
        query: filters.query,
        month: localDate(Date.now(), data.timezone).slice(0, 7),
      })}>Return to Today</a
    >
  </section>
{:else if !items.length && !data.timelineError}
  <section class="surface">
    <h2>
      {filters.tags.length || filters.query || filters.day
        ? 'No matching notes'
        : 'A quiet place to begin'}
    </h2>
    <p>
      {filters.tags.length || filters.query || filters.day
        ? 'No published notes match every search term and selected filter. Remove a filter or clear all.'
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
  {:else if nextCursor && !emptyMonth}<button onclick={loadOlder}
      >Load older notes</button
    >
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
