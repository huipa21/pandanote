<script lang="ts">
  import { page } from '$app/state';
  import {
    goto,
    invalidate,
    invalidateAll,
    beforeNavigate,
  } from '$app/navigation';
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
  import Modal from '#lib/components/Modal.svelte';
  import { VAULT, type VaultControls } from '#lib/client/vault.ts';
  import { trError } from '#lib/client/i18n-current.ts';
  import type { ApiResult } from '#lib/shared/domain.ts';
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
  async function resumeNavigation(target: URL) {
    resumingNavigation = true;
    try {
      await goto(target, { reset: false });
    } finally {
      resumingNavigation = false;
    }
  }
  beforeNavigate((navigation) => {
    if (resumingNavigation || navigation.willUnload || !navigation.to?.url)
      return;
    // A click outside an inline edit already saves it without asking; follow the
    // clicked link once that save succeeds (a failed save keeps the editor open).
    const autosave = workspace.autosave;
    if (autosave) {
      navigation.cancel();
      const target = navigation.to.url;
      void autosave.then((saved) => {
        if (saved && !workspace.dirty && !workspace.frozen)
          void resumeNavigation(target);
      });
      return;
    }
    if (!workspace.dirty && !workspace.busy && !workspace.frozen) return;
    navigation.cancel();
    // Repeated navigation clicks cannot queue competing destinations on one dialog.
    if (workspace.confirmModalOpen) return;
    const target = navigation.to.url;
    void workspace.promptUnsavedChanges().then(async (proceed) => {
      if (proceed) await resumeNavigation(target);
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
  let vaultDialog = $state(false);
  let vaultPassword = $state('');
  let vaultBusy = $state(false);
  let vaultSyncing = $state(false);
  let vaultError = $state('');
  let vaultNotice = $state('');
  let vaultChannel: BroadcastChannel | undefined;
  let vaultSyncGeneration = 0;
  setContext<VaultControls>(VAULT, {
    get open() {
      return data.vault.open;
    },
    get busy() {
      return vaultBusy || vaultSyncing;
    },
    activate() {
      vaultError = '';
      if (data.vault.open) void changeVault();
      else {
        vaultPassword = '';
        vaultDialog = true;
      }
    },
  });
  function clearPrivateEditor() {
    if (workspace.active?.isPrivate || workspace.active?.basePrivate) {
      workspace.resetSession();
      vaultNotice = t('vault.draftCleared');
    }
    workspace.postConflict = null;
    if (workspace.saved?.snapshot?.isPrivate)
      workspace.saved = { ...workspace.saved, snapshot: undefined };
  }
  async function syncVault(target?: string, hide = true) {
    const generation = ++vaultSyncGeneration;
    if (hide) vaultSyncing = true;
    vaultError = '';
    try {
      const response = await fetch('/api/auth/vault', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as ApiResult<{
        open: boolean;
        version: number;
      }>;
      if (generation !== vaultSyncGeneration) return;
      if (!result.ok) throw new Error(trError(result.error));
      if (!result.data.open && data.vault.open) clearPrivateEditor();
      if (result.data.version !== data.vault.version) {
        vaultSyncing = true;
        calendar.dispose();
      }
      if (target) await goto(target, { invalidateAll: true, reset: false });
      else if (result.data.version !== data.vault.version)
        await invalidateAll();
      if (generation === vaultSyncGeneration) vaultSyncing = false;
    } catch (error) {
      if (generation === vaultSyncGeneration) {
        vaultSyncing = true;
        vaultError =
          error instanceof Error ? error.message : t('vault.syncFailed');
      }
    }
  }
  async function changeVault(password?: string) {
    if (vaultBusy || vaultSyncing) return;
    vaultBusy = true;
    vaultError = '';
    let closing = false;
    try {
      if (!(await workspace.promptUnsavedChanges())) return;
      closing = password === undefined;
      if (closing) vaultSyncing = true;
      const response = await fetch('/api/auth/vault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          password === undefined
            ? { action: 'close' }
            : { action: 'unlock', password },
        ),
        signal: AbortSignal.timeout(30_000),
      });
      const result = (await response.json()) as ApiResult<{
        open: boolean;
        version: number;
      }>;
      if (!result.ok) throw new Error(trError(result.error));
      vaultDialog = false;
      vaultPassword = '';
      vaultChannel?.postMessage('changed');
      await syncVault(result.data.open ? '/?vault=1' : '/');
    } catch (error) {
      vaultError =
        error instanceof Error ? error.message : t('vault.syncFailed');
      if (closing) {
        vaultChannel?.postMessage('changed');
        await syncVault('/');
      }
    } finally {
      vaultBusy = false;
      vaultPassword = '';
    }
  }
  onMount(() => {
    vaultChannel = new BroadcastChannel('pandanote-vault');
    vaultChannel.onmessage = () => {
      void syncVault();
    };
    const focus = () => {
      if (!vaultBusy) void syncVault(undefined, data.vault.open);
    };
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    void syncVault(undefined, data.vault.open);
    return () => {
      vaultChannel?.close();
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
    };
  });
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

{#if vaultSyncing}
  <section class="surface" aria-busy="true">
    <p role="status">{t(vaultError ? 'vault.syncFailed' : 'vault.checking')}</p>
    {#if vaultError}<p role="alert">{vaultError}</p>
      <a href="/login" data-sveltekit-reload>{t('auth.signIn')}</a>
    {/if}
    <button disabled={vaultBusy} onclick={() => void syncVault()}
      >{t('vault.retry')}</button
    >
  </section>
{/if}
<div
  class:vault-hidden={vaultSyncing}
  style="display: contents;"
  inert={vaultSyncing}
>
  {#key data.vault.version}
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
      {#if vaultNotice}<p role="status">{vaultNotice}</p>{/if}
      {#if vaultError && !vaultDialog}<p role="alert">{vaultError}</p>{/if}
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
  {/key}
  <UnsavedChangesDialog {workspace} />
  <ConflictDialog {workspace} />
  <StaleTagDialog {workspace} />
  <LifecycleDialog />
</div>
<Modal
  bind:open={vaultDialog}
  title={t('vault.unlock')}
  dismissible={!vaultBusy}
  onDismiss={() => {
    vaultPassword = '';
    vaultError = '';
  }}
>
  <form
    class="vault-form"
    onsubmit={(event) => {
      event.preventDefault();
      void changeVault(vaultPassword);
    }}
  >
    <p>{t('vault.passwordHelp')}</p>
    <label for="vault-password">{t('auth.password')}</label>
    <input
      id="vault-password"
      type="password"
      autocomplete="current-password"
      maxlength="256"
      required
      disabled={vaultBusy}
      bind:value={vaultPassword}
      data-initial-focus
    />
    {#if vaultError}<p role="alert">{vaultError}</p>{/if}
    <div class="vault-actions">
      <button type="submit" class="primary" disabled={vaultBusy}
        >{t('vault.unlockAction')}</button
      >
    </div>
  </form>
</Modal>

<style>
  .vault-hidden {
    visibility: hidden;
  }
  .vault-form {
    display: grid;
    gap: var(--space-2);
  }
  .vault-form p {
    margin: 0;
  }
  .vault-form input {
    width: 100%;
  }
  .vault-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
