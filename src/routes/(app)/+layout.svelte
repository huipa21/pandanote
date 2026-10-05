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
  import LifecycleDialog from '#lib/components/LifecycleDialog.svelte';
  import {
    LIFECYCLE,
    LifecycleState,
  } from '#lib/client/drafts/lifecycle.svelte.ts';
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
  const lifecycle = new LifecycleState(workspace.accountId, (result) =>
    workspace.recordMutation(result),
  );
  setContext(LIFECYCLE, lifecycle);
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
      void invalidate('pandanote:timeline');
      void invalidate('pandanote:status-notes');
      if (page.state.detailId === saved.result.noteId) detailRetry++;
      if (page.data.detail?.id === saved.result.noteId) {
        if (saved.result.deleted) void goto('/trash', { reset: false });
        else void invalidate('pandanote:detail');
      }
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
  filters={page.data.timeline?.filters ?? { tags: [] }}
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
<LifecycleDialog />
