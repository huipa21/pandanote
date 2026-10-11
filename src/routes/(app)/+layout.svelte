<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidate, beforeNavigate } from '$app/navigation';
  import { onMount, setContext, untrack } from 'svelte';
  import {
    CALENDAR,
    CalendarState,
  } from '#lib/client/timeline/calendar.svelte.ts';
  import {
    EDITOR_WORKSPACE,
    EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import AppShell from '#lib/components/AppShell.svelte';
  import LifecycleDialog from '#lib/components/LifecycleDialog.svelte';
  import {
    LIFECYCLE,
    LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  import ConflictDialog from '#lib/components/ConflictDialog.svelte';
  import StaleTagDialog from '#lib/components/StaleTagDialog.svelte';
  import {
    READING,
    ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  let { children, data } = $props();
  const workspace = new EditorWorkspace(
    untrack(() => data.account.id),
    untrack(() => data.timezone),
  );
  setContext(EDITOR_WORKSPACE, workspace);
  let resumingNavigation = false;
  beforeNavigate((navigation) => {
    if (
      resumingNavigation ||
      navigation.willUnload ||
      !navigation.to?.url ||
      (!workspace.dirty && !workspace.busy && !workspace.frozen)
    )
      return;
    navigation.cancel();
    // Repeated navigation clicks cannot queue competing destinations on one dialog.
    if (workspace.confirmModalOpen) return;
    const target = navigation.to.url;
    void workspace.promptUnsavedChanges().then(async (proceed) => {
      if (!proceed) return;
      resumingNavigation = true;
      try {
        await goto(target, { reset: false });
      } finally {
        resumingNavigation = false;
      }
    });
  });
  const lifecycle = new LifecycleState(workspace.accountId, (result) =>
    workspace.recordMutation(result),
  );
  setContext(LIFECYCLE, lifecycle);
  const reading = new ReadingState();
  setContext(READING, reading);
  $effect(() => {
    reading.detail = Boolean(page.data.detail);
  });
  const calendar = new CalendarState(untrack(() => data.calendar));
  setContext(CALENDAR, calendar);
  let handledCalendarSave = untrack(() => workspace.saved?.serial ?? 0);
  $effect(() => {
    const saved = workspace.saved;
    if (saved && saved.serial > handledCalendarSave) {
      handledCalendarSave = saved.serial;
      void invalidate('pandanote:calendar');
      void invalidate('pandanote:timeline');
      void invalidate('pandanote:status-notes');
      if (page.data.detail?.id === saved.result.noteId) {
        if (saved.result.deleted) void goto('/trash', { reset: false });
        else void invalidate('pandanote:detail');
      }
    }
  });
  let handledTags = 0;
  $effect(() => {
    const serial = workspace.tagsChanged;
    if (serial > handledTags) {
      handledTags = serial;
      void invalidate('pandanote:timeline');
      void invalidate('pandanote:status-notes');
      void invalidate('pandanote:detail');
    }
  });
  $effect(() => {
    workspace.timezone = data.timezone;
    workspace.limits = data.storageLimits;
    workspace.knownTags = data.tagSuggestions;
  });
  $effect(() => {
    const month = calendar.month;
    const initial = data.calendar;
    untrack(() => {
      if (month) void calendar.refresh(initial);
    });
  });
  onMount(() => {
    lifecycle.start();
    const syncRetries = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(lifecycle.key))
        lifecycle.start();
    };
    window.addEventListener('storage', syncRetries);
    let ended = false;
    let stop: (() => void) | undefined;
    void workspace.start().then((cleanup) => {
      if (ended) cleanup();
      else stop = cleanup;
    });
    return () => {
      ended = true;
      calendar.dispose();
      window.removeEventListener('storage', syncRetries);
      stop?.();
    };
  });
</script>

<AppShell
  {calendar}
  active={page.url.pathname}
  tags={data.availableTags}
  filters={page.data.timeline?.filters ?? {}}
  searchQuery={page.url.searchParams.get('q') ?? ''}
  onSearch={(href) => goto(href, { reset: false })}
>
  {#if lifecycle.warning}<p role="alert">{lifecycle.warning}</p>{/if}
  {#if lifecycle.pending.length}<section
      class="surface"
      aria-label="Unconfirmed note actions"
    >
      <h2>Unconfirmed note actions · this browser</h2>
      <p class="help">
        These actions may already have succeeded. Retry the exact saved command
        to check safely, even after reload.
      </p>
      {#each lifecycle.pending as attempt (attempt.mutationId)}<button
          disabled={lifecycle.busy}
          onclick={() => lifecycle.resume(attempt)}
          >Review {attempt.action} · {attempt.noteId.slice(0, 8)}</button
        >{/each}
    </section>{/if}
  {@render children()}</AppShell
>
<ConflictDialog {workspace} />
<StaleTagDialog {workspace} />
<LifecycleDialog />
