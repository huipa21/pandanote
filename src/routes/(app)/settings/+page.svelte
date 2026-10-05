<script lang="ts">
  import { untrack, onMount, getContext } from 'svelte';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  const workspace = getContext<DraftWorkspace>(DRAFT_WORKSPACE);
  import CalendarSettings from '#lib/components/CalendarSettings.svelte';
  import SecuritySettings from '#lib/components/SecuritySettings.svelte';
  import { invalidateAll } from '$app/navigation';
  import { appearanceSchema, type Appearance } from '#lib/shared/appearance.ts';
  let { data } = $props();
  // A form snapshot intentionally survives failed saves/revalidation.
  const initial = untrack(() => data.appearance);
  let theme = $state<Appearance['theme']>(initial.theme);
  let density = $state<Appearance['density']>(initial.density);
  let collapseLongNotes = $state(initial.collapseLongNotes);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
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
    if (!(await workspace.flush())) {
      error =
        'Local edits are not safely saved. Keep another copy or resolve the draft warning before signing out.';
      return;
    }
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

<svelte:head><title>Settings — PandaNote</title></svelte:head>
<section class="surface">
  <h1>Settings</h1>
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
        ><option value="comfortable">Comfortable</option><option value="compact"
          >Compact</option
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
        Long cards follow this preference. Show more expands an individual card.
      </p>
      <button class="primary" type="submit"
        >{saving ? 'Saving…' : 'Save appearance'}</button
      >
    </fieldset>
    <p role="status">{message}</p>
  </form>
  <p role="alert">{error}</p>
</section>
<CalendarSettings initial={data.calendar} />
<section class="surface">
  <SecuritySettings />
  <button onclick={signOut} disabled={signingOut}
    >{signingOut ? 'Signing out…' : 'Sign out'}</button
  >
  <p class="help">
    Signing out leaves local drafts on this device. Anyone controlling this
    browser can read them; discard drafts explicitly if needed.
  </p>
</section>
<section class="surface">
  <h2>Storage & backups</h2>
  <p class="muted">
    Storage settings come in S15. Manual backup and uploaded restore come in
    S16–S17.
  </p>
</section>

<style>
  h1 {
    margin-top: 0;
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
