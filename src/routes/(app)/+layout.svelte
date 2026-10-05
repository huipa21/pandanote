<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidate } from '$app/navigation';
  import { onMount, setContext, untrack } from 'svelte';
  import {
    CALENDAR,
    CalendarState,
  } from '#lib/client/timeline/calendar.svelte.ts';
  import {
    DRAFT_WORKSPACE,
    DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import AppShell from '#lib/components/AppShell.svelte';
  import NoteDetail from '#lib/components/NoteDetail.svelte';
  import ConflictDialog from '#lib/components/ConflictDialog.svelte';
  import {
    READING,
    ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  import type { ApiResult, NoteSnapshot } from '#lib/shared/domain.ts';
  let { children, data } = $props();
  const workspace = new DraftWorkspace(
    untrack(() => data.account.id),
    untrack(() => data.timezone),
  );
  setContext(DRAFT_WORKSPACE, workspace);
  const reading = new ReadingState();
  setContext(READING, reading);
  let detail = $state<NoteSnapshot | null>(null);
  let detailError = $state('');
  let detailRetry = $state(0);
  $effect(() => {
    reading.detail = Boolean(page.state.detailId || page.data.detail);
  });
  $effect(() => {
    const id = page.state.detailId;
    const retry = detailRetry;
    void retry;
    detail = null;
    detailError = '';
    if (!id || page.data.detail) return;
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    void fetch(`/api/notes/${id}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResult<NoteSnapshot>;
        if (!live) return;
        if (payload.ok) detail = payload.data;
        else detailError = payload.error.message;
      })
      .catch(() => {
        if (live)
          detailError =
            'The full note could not be loaded. Retry without losing your timeline place.';
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  });
  async function closeDetail() {
    // Only shallow entries created by Open note use Back. Deep links/refreshes
    // have no invented prior timeline and close to All notes instead.
    if (page.state.detailId) {
      const closed = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      history.back();
      await closed;
    }
  }
  const calendar = new CalendarState(untrack(() => data.calendar));
  setContext(CALENDAR, calendar);
  let handledCalendarSave = untrack(() => workspace.saved?.serial ?? 0);
  $effect(() => {
    const saved = workspace.saved;
    if (saved && saved.serial > handledCalendarSave) {
      handledCalendarSave = saved.serial;
      void invalidate('pandanote:calendar');
    }
  });
  $effect(() => {
    workspace.timezone = data.timezone;
  });
  $effect(() => {
    const month = calendar.month;
    const initial = data.calendar;
    untrack(() => {
      if (month) void calendar.refresh(initial);
    });
  });
  onMount(() => {
    let ended = false;
    let stop: (() => void) | undefined;
    void workspace.start().then((cleanup) => {
      if (ended) cleanup();
      else stop = cleanup;
    });
    return () => {
      ended = true;
      calendar.dispose();
      stop?.();
    };
  });
</script>

<AppShell
  {calendar}
  active={page.url.pathname}
  tags={data.availableTags}
  filters={page.data.timeline?.filters ?? { tags: [] }}
  searchQuery={page.url.searchParams.get('q') ?? ''}
  onSearch={(href) => goto(href, { reset: false })}
  >{@render children()}</AppShell
>
{#if page.state.detailId && !page.data.detail}
  {#key page.state.detailId}
    <NoteDetail
      note={detail}
      error={detailError}
      initialImage={page.state.detailImage}
      onClose={closeDetail}
      onRetry={() => {
        detailRetry++;
      }}
    />
  {/key}
{/if}
<ConflictDialog {workspace} />
