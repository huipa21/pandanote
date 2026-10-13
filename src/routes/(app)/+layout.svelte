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
  import UnsavedChangesDialog from '#lib/components/UnsavedChangesDialog.svelte';
  import StaleTagDialog from '#lib/components/StaleTagDialog.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';
  import {
    READING,
    ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  let { children, data } = $props();
  const t = useI18n().t;
  const ACTION_LABELS: Record<string, MessageKey> = {
    restore: 'note.restore',
    pin: 'note.pin',
    unpin: 'note.unpin',
    trash: 'note.delete',
    'permanent-delete': 'note.deletePermanently',
  };
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
        // Delete from the note page returns to the timeline (the "All notes" link).
        else if (saved.result.status === 'trash')
          void goto('/', { reset: false });
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
  searchQuery={page.url.pathname === '/'
    ? (page.url.searchParams.get('q') ?? '')
    : ''}
  onSearch={(href) => goto(href, { reset: false })}
>
  {#if lifecycle.warning}<p role="alert">{lifecycle.warning}</p>{/if}
  {#if lifecycle.pending.length}<section
      class="surface"
      aria-label={t('route.unconfirmed')}
    >
      <h2>{t('route.unconfirmedHeading')}</h2>
      <p class="help">
        {t('route.unconfirmedHelp')}
      </p>
      {#each lifecycle.pending as attempt (attempt.mutationId)}<button
          disabled={lifecycle.busy}
          onclick={() => lifecycle.resume(attempt)}
          >{t('route.review', {
            action: ACTION_LABELS[attempt.action]
              ? t(ACTION_LABELS[attempt.action])
              : attempt.action,
            id: attempt.noteId.slice(0, 8),
          })}</button
        >{/each}
    </section>{/if}
  {@render children()}</AppShell
>
<UnsavedChangesDialog {workspace} />
<ConflictDialog {workspace} />
<StaleTagDialog {workspace} />
<LifecycleDialog />
