<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { languages, languageInfo } from '#lib/shared/i18n/registry.ts';
  import { siteTitleSchema, languageSchema } from '#lib/shared/settings.ts';
  const i18n = useI18n();
  const t = i18n.t;
  // Form snapshots intentionally survive failed saves and revalidation.
  let siteTitle = $state(untrack(() => i18n.siteTitle));
  let language = $state(untrack(() => i18n.language));
  let busy = $state(false);
  let ready = $state(false);
  let titleError = $state('');
  let message = $state('');
  let error = $state('');
  onMount(() => {
    ready = true;
  });
  async function save(body: { siteTitle?: string; language?: string }) {
    if (busy) return false;
    busy = true;
    message = '';
    error = '';
    try {
      const response = await fetch('/api/settings/general', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        error = result.error?.message ?? t('general.failed');
        return false;
      }
      // Apply only confirmed state; reload/SSR uses the same saved settings.
      i18n.language = result.data.language;
      i18n.siteTitle = result.data.siteTitle;
      siteTitle = result.data.siteTitle;
      language = result.data.language;
      await invalidateAll();
      message = t('general.saved');
      return true;
    } catch {
      error = t('general.network');
      return false;
    } finally {
      busy = false;
    }
  }
  async function saveTitle(event: SubmitEvent) {
    event.preventDefault();
    titleError = '';
    const parsed = siteTitleSchema.safeParse(siteTitle);
    if (!parsed.success) {
      titleError = i18n.msg(parsed.error.issues[0].message);
      return;
    }
    await save({ siteTitle: parsed.data });
  }
  async function saveLanguage(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const parsed = languageSchema.safeParse(value);
    if (!parsed.success) return;
    const previous = i18n.language;
    if (!(await save({ language: parsed.data }))) language = previous;
  }
</script>

<section class="surface" aria-labelledby="general-heading">
  <h2 id="general-heading">{t('general.heading')}</h2>
  <p class="help">{t('general.help')}</p>
  <form onsubmit={saveTitle} novalidate>
    <fieldset disabled={busy || !ready}>
      <label for="general-title">{t('general.siteTitle')}</label>
      <input
        id="general-title"
        autocomplete="off"
        bind:value={siteTitle}
        aria-invalid={!!titleError}
        aria-describedby="general-title-error"
      />
      <p id="general-title-error" class="field-error">{titleError}</p>
      <button class="primary" type="submit"
        >{busy ? t('general.saving') : t('general.save')}</button
      >
    </fieldset>
  </form>
  <fieldset disabled={busy || !ready}>
    <label for="general-language">{t('general.language')}</label>
    <select
      id="general-language"
      bind:value={language}
      onchange={saveLanguage}
      aria-describedby="general-language-help"
    >
      {#each languages as item (item.code)}<option value={item.code}
          >{item.nativeName}</option
        >{/each}
    </select>
  </fieldset>
  <p id="general-language-help" class="help">
    {#if !languageInfo(i18n.language).complete}{t('general.partial')}{/if}
  </p>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  label {
    display: block;
    margin-block: var(--space-3) var(--space-1);
  }
  input {
    display: block;
    width: min(100%, 26rem);
  }
  select {
    width: min(100%, 22rem);
  }
  button {
    margin-top: var(--space-3);
  }
</style>
