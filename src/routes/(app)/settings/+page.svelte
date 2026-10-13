<script lang="ts">
  import { untrack, onMount, getContext } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  import GeneralSettings from '#lib/components/GeneralSettings.svelte';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import CalendarSettings from '#lib/components/CalendarSettings.svelte';
  import SecuritySettings from '#lib/components/SecuritySettings.svelte';
  import AccountSettings from '#lib/components/AccountSettings.svelte';
  import StorageSettings from '#lib/components/StorageSettings.svelte';
  import BackupSettings from '#lib/components/BackupSettings.svelte';
  import { buildInfo } from '#lib/shared/version.ts';
  import { invalidateAll } from '$app/navigation';
  import { appearanceSchema, type Appearance } from '#lib/shared/appearance.ts';
  let { data } = $props();
  const t = useI18n().t;
  // A form snapshot intentionally survives failed saves/revalidation.
  const initial = untrack(() => data.appearance);
  let theme = $state<Appearance['theme']>(initial.theme);
  let density = $state<Appearance['density']>(initial.density);
  let collapseLongNotes = $state(initial.collapseLongNotes);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  // Panels stay mounted (hidden when inactive) so unsaved form state survives tab switches.
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'account', label: 'Account' },
    { id: 'storage', label: 'Storage' },
    { id: 'backups', label: 'Backups' },
    { id: 'about', label: 'About' },
  ] as const;
  type TabId = (typeof tabs)[number]['id'];
  let tab = $state<TabId>('general');
  function onTabKey(event: KeyboardEvent) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length;
    tab = tabs[next].id;
    document.getElementById(`settings-tab-${tab}`)?.focus();
  }

  let saving = $state(false);
  let signingOut = $state(false);
  let message = $state('');
  let error = $state('');
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    message = '';
    error = '';
    try {
      const response = await fetch('/api/settings/appearance', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, density, collapseLongNotes }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        error =
          result.error?.message ?? 'Could not save appearance. Please retry.';
        return;
      }
      const appearance = appearanceSchema.parse(result.appearance);
      // Apply only confirmed state. Reload/SSR uses the same database settings.
      document.documentElement.dataset.theme = appearance.theme;
      document.documentElement.dataset.density = appearance.density;
      document.documentElement.dataset.collapse = String(
        appearance.collapseLongNotes,
      );
      await invalidateAll();
      message = 'Appearance saved.';
    } catch {
      error =
        'Could not save appearance. Your choices remain here; please retry.';
    } finally {
      saving = false;
    }
  }
  async function signOut() {
    if (signingOut) return;
    if (!(await workspace.promptUnsavedChanges())) return;
    signingOut = true;
    error = '';
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok || response.status === 401) {
        window.location.assign('/login');
        return;
      }
      error = 'Could not sign out. Please retry.';
    } catch {
      error = 'Could not reach the server. Please retry signing out.';
    } finally {
      signingOut = false;
    }
  }
</script>

<PageTitle title={t('settings.title')} />
<h1 class="page-title">{t('settings.title')}</h1>
<div class="tabs" role="tablist" aria-label="Settings sections">
  {#each tabs as item (item.id)}
    <button
      id={`settings-tab-${item.id}`}
      type="button"
      role="tab"
      aria-selected={tab === item.id}
      aria-controls={`settings-panel-${item.id}`}
      tabindex={tab === item.id ? 0 : -1}
      onclick={() => (tab = item.id)}
      onkeydown={onTabKey}>{item.label}</button
    >
  {/each}
</div>

<div
  id="settings-panel-general"
  role="tabpanel"
  aria-labelledby="settings-tab-general"
  hidden={tab !== 'general'}
>
  <GeneralSettings />
</div>

<div
  id="settings-panel-appearance"
  role="tabpanel"
  aria-labelledby="settings-tab-appearance"
  hidden={tab !== 'appearance'}
>
  <section class="surface">
    <h2>Appearance</h2>
    <p class="help">
      Saved for your notebook, including other signed-in devices on their next
      page load. Follow system is the initial theme.
    </p>
    <form onsubmit={save}>
      <fieldset disabled={saving || !ready}>
        <label for="theme">Theme</label>
        <select id="theme" bind:value={theme}
          ><option value="system">Follow system</option><option value="light"
            >Light</option
          ><option value="dark">Dark</option></select
        >
        <label for="density">Density</label>
        <select id="density" bind:value={density}
          ><option value="comfortable">Comfortable</option><option
            value="compact">Compact</option
          ></select
        >
        <label class="checkbox" for="collapse"
          ><input
            id="collapse"
            type="checkbox"
            bind:checked={collapseLongNotes}
          />Collapse long notes by default</label
        >
        <p class="help">
          Long cards follow this preference. Show more expands an individual
          card.
        </p>
        <button class="primary" type="submit"
          >{saving ? 'Saving…' : 'Save appearance'}</button
        >
      </fieldset>
      <p role="status">{message}</p>
    </form>
    <p role="alert">{error}</p>
  </section>
</div>

<div
  id="settings-panel-calendar"
  role="tabpanel"
  aria-labelledby="settings-tab-calendar"
  hidden={tab !== 'calendar'}
>
  <CalendarSettings initial={data.calendar} />
</div>

<div
  id="settings-panel-account"
  role="tabpanel"
  aria-labelledby="settings-tab-account"
  hidden={tab !== 'account'}
>
  <AccountSettings
    initial={data.accountDetails}
    mfaEnabled={data.account.mfaEnabled}
  />
  <section class="surface">
    <SecuritySettings />
    <button onclick={signOut} disabled={signingOut || !ready}
      >{signingOut ? 'Signing out…' : 'Sign out'}</button
    >
  </section>
</div>

<div
  id="settings-panel-storage"
  role="tabpanel"
  aria-labelledby="settings-tab-storage"
  hidden={tab !== 'storage'}
>
  <StorageSettings initial={data.storageLimits} timezone={data.timezone} />
</div>

<div
  id="settings-panel-backups"
  role="tabpanel"
  aria-labelledby="settings-tab-backups"
  hidden={tab !== 'backups'}
>
  <BackupSettings />
</div>

<div
  id="settings-panel-about"
  role="tabpanel"
  aria-labelledby="settings-tab-about"
  hidden={tab !== 'about'}
>
  <section class="surface" aria-labelledby="about-heading" id="about">
    <h2 id="about-heading">About PandaNote</h2>
    <dl class="build-info">
      <dt>Version</dt>
      <dd data-about-version>{buildInfo.version}</dd>
      {#if buildInfo.kind === 'release'}
        <dt>Commit</dt>
        <dd><code data-about-commit>{buildInfo.commit}</code></dd>
        <dt>Commit time (UTC)</dt>
        <dd>
          <time datetime={buildInfo.committedAt}>{buildInfo.committedAt}</time>
        </dd>
      {:else}
        <dt>Build</dt>
        <dd>Local development / non-release build</dd>
      {/if}
    </dl>
  </section>
</div>

<style>
  .page-title {
    margin: 0;
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    flex: none;
    min-height: var(--target);
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: none;
    padding-inline: var(--space-3);
  }
  .tabs button[aria-selected='true'] {
    border-bottom-color: var(--accent);
    font-weight: 650;
  }
  [role='tabpanel'] {
    display: grid;
    gap: var(--space-4);
  }
  [role='tabpanel'][hidden] {
    display: none;
  }
  .build-info dt {
    font-weight: 650;
    margin-top: var(--space-3);
  }
  .build-info dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  label:not(.checkbox) {
    display: block;
    margin-block: var(--space-3) var(--space-1);
  }
  select {
    width: min(100%, 22rem);
  }
  .checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--target);
    margin-top: var(--space-4);
  }
  .checkbox input {
    width: 1.25rem;
    height: 1.25rem;
    min-height: 0;
    accent-color: var(--accent);
    flex: none;
  }
</style>
