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
  let { children, data } = $props();
  const workspace = new DraftWorkspace(
    untrack(() => data.account.id),
    untrack(() => data.timezone),
  );
  setContext(DRAFT_WORKSPACE, workspace);
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
