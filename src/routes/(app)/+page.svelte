<script lang="ts">
  import { getContext, onMount, tick, untrack } from 'svelte';
  import {
    afterNavigate,
    beforeNavigate,
    invalidate,
    snapshot,
  } from '$app/navigation';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import {
    CALENDAR,
    type CalendarState,
  } from '#lib/client/timeline/calendar.svelte.ts';
  import { localDate } from '#lib/shared/calendar.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import NoteCard from '#lib/components/NoteCard.svelte';
  import TagHeader from '#lib/components/TagHeader.svelte';
  import {
    READING,
    type ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  import { matchesSearch, parseSearch } from '#lib/shared/search.ts';
  import { noteHasTag, type TimelineFilters } from '#lib/shared/timeline.ts';
  function matchesFilters(
    note: NoteSnapshot,
    filters: TimelineFilters,
  ): boolean {
    return (
      note.status === 'published' &&
      (filters.tag === undefined || noteHasTag(note.tags, filters.tag)) &&
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
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const calendar = getContext<CalendarState>(CALENDAR);
  const reading = getContext<ReadingState>(READING);
  const { t } = useI18n();
  /** Plain "All notes" view: the only view with a Pinned section. */
  function isPlain(value: TimelineFilters) {
    return (
      value.tag === undefined && !value.query && !value.day && !value.month
    );
  }
  const byPin = (a: TimelineCard, b: TimelineCard) =>
    (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) ||
    (a.id === b.id ? 0 : a.id < b.id ? 1 : -1);
  /** Put a card into the Pinned section or its chronological place. */
  function place(card: TimelineCard) {
    pinned = pinned.filter((n) => n.id !== card.id);
    if (isPlain(filters) && card.pinnedAt !== null) {
      items = items.filter((n) => n.id !== card.id);
      pinned = [...pinned, card].sort(byPin);
    } else items = mergeCards(items, [card]);
  }
  function queryKey(value: TimelineFilters) {
    return filterKey(value) + '|' + data.timezone + '|' + data.tagGeneration;
  }
  function knownPublished(note: TimelineCard) {
    return !workspace.recentMutations.some(
      (result) =>
        result.noteId === note.id &&
        result.revision >= note.revision &&
        (result.deleted || result.status !== 'published'),
    );
  }
  let items = $state<TimelineCard[]>(untrack(() => data.timeline?.items ?? []));
  let pinned = $state<TimelineCard[]>(
    untrack(() => data.timeline?.pinned ?? []),
  );
  let nextCursor = $state<string | null>(
    untrack(() => data.timeline?.nextCursor ?? null),
  );
  let filters = $state(untrack(() => data.timeline?.filters ?? {}));
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
      pinned: $state.snapshot(pinned),
      nextCursor,
      filters: $state.snapshot(filters),
      expanded: [...expanded],
      calendarMonth: calendar.month,
      emptyMonth,
      timezone: data.timezone,
      tagGeneration: data.tagGeneration,
      anchor: scroller ? captureAnchor(scroller) : null,
    }),
    restore: (value) => {
      cancel();
      restored = true;
      if (
        value.timezone !== data.timezone ||
        value.tagGeneration !== data.tagGeneration
      )
        return;
      loadedKey = queryKey(value.filters);
      calendar.month = value.calendarMonth;
      emptyMonth = value.emptyMonth;
      followScroll = true;
      items = value.items.filter(knownPublished);
      pinned = (value.pinned ?? []).filter(knownPublished);
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
        pinned = [];
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
      const first = initial.items.filter(knownPublished);
      // The first page always carries the complete Pinned list (plain view only).
      pinned = (initial.pinned ?? []).filter(knownPublished);
      const pinnedIds = new Set(pinned.map((n) => n.id));
      items = (
        same ? mergeCards(items.filter(knownPublished), first) : first
      ).filter((n) => !pinnedIds.has(n.id));
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
        const alreadyLoaded =
          changed &&
          (items.some((n) => n.id === changed.id) ||
            pinned.some((n) => n.id === changed.id));
        const toPinned =
          changed && isPlain(filters) && changed.pinnedAt !== null;
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
        savedOutsideRange =
          !matches || (!alreadyLoaded && !withinLoadedDates && !toPinned);
        // A card that still matches stays in place (keeps its focus and position)
        // until its re-rendered replacement arrives.
        if (changed && !(alreadyLoaded && matches)) {
          items = items.filter((n) => n.id !== changed.id);
          pinned = pinned.filter((n) => n.id !== changed.id);
        }
        void (async () => {
          if (
            changed &&
            matches &&
            (alreadyLoaded || withinLoadedDates || toPinned)
          ) {
            try {
              const card = await snapshotCard(changed, filters.query);
              if (disposed || key !== queryKey(filters)) return;
              place(card);
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
      reading.paused ||
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
      items = mergeCards(
        items.filter(knownPublished),
        payload.data.items.filter(knownPublished),
      );
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
  // Back can restore a pre-mutation history snapshot. Reconcile known newer
  // published revisions as well as filtering known Trash/deleted IDs.
  $effect(() => {
    if (!mounted) return;
    const recent = workspace.recentMutations;
    untrack(() => {
      for (const result of recent) {
        const note = [...items, ...pinned].find(
          (note) => note.id === result.noteId,
        );
        if (note && note.revision < result.revision) mutation(result);
      }
    });
  });
  function mutation(result: MutationResult) {
    const anchor = captureAnchor(scroller);
    if (result.status !== 'published' || result.deleted) {
      items = items.filter((n) => n.id !== result.noteId);
      pinned = pinned.filter((n) => n.id !== result.noteId);
    }
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
            const toPinned = isPlain(filters) && card.pinnedAt !== null;
            const visibleRange =
              toPinned ||
              items.some((n) => n.id === card.id) ||
              !nextCursor ||
              !oldest ||
              card.timelineAt > oldest.timelineAt ||
              (card.timelineAt === oldest.timelineAt && card.id >= oldest.id);
            const matches =
              matchesFilters(payload.data, filters) &&
              (data.timeline?.anchor == null ||
                card.timelineAt < data.timeline.anchor) &&
              (!emptyMonth ||
                monthKey(card.timelineAt, data.timezone) === filters.month);
            if (matches && visibleRange) place(card);
            else {
              items = items.filter((n) => n.id !== result.noteId);
              pinned = pinned.filter((n) => n.id !== result.noteId);
            }
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

<PageTitle
  title={data.tagSummary ? `#${data.tagSummary.display}` : 'All notes'}
/>
<svelte:head
  ><meta
    name="description"
    content="Your private personal notebook"
  /></svelte:head
>
<div class="timeline-status" data-top-month={topMonth}>
  {#if data.tagSummary}{#key data.tagSummary.key}<TagHeader
        summary={data.tagSummary}
        leaveHref={filterHref({ ...filters, tag: undefined })}
      />{/key}{:else}<h1 class="sr-only">All notes</h1>{/if}
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
        tag: filters.tag,
        query: filters.query,
        month: localDate(Date.now(), data.timezone).slice(0, 7),
      })}>Return to Today</a
    >
  </section>
{:else if !items.length && !pinned.length && !data.timelineError}
  <section class="surface">
    <h2>
      {filters.tag !== undefined || filters.query || filters.day
        ? 'No matching notes'
        : 'A quiet place to begin'}
    </h2>
    <p>
      {filters.tag !== undefined || filters.query || filters.day
        ? 'No published notes match every search term and selected filter. Remove a filter or clear all.'
        : 'Write your first note above. Published notes will appear here.'}
    </p>
  </section>
{/if}
{#if pinned.length}
  <section class="pinned" aria-labelledby="pinned-heading">
    <h2 class="month-separator" id="pinned-heading">{t('note.pinned')}</h2>
    {#each pinned as note (note.id)}
      <NoteCard
        {note}
        {filters}
        timezone={workspace.timezone}
        expanded={expanded.includes(note.id)}
        onExpansion={expansion}
        onMutation={mutation}
      />
    {/each}
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
  /* Pinned cards stack like the timeline: same gap as sibling cards. */
  .pinned {
    display: grid;
    gap: var(--card-gap);
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
