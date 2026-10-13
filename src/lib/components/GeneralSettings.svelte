<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    siteTitleSchema,
    taglineSchema,
    densitySchema,
  } from '#lib/shared/settings.ts';

  let {
    initialCollapseLongNotes,
    initialDensity,
  }: {
    initialCollapseLongNotes: boolean;
    initialDensity: import('#lib/shared/appearance.ts').Appearance['density'];
  } = $props();

  const i18n = useI18n();
  const t = i18n.t;

  // Form snapshots intentionally survive failed saves and revalidation.
  let siteTitle = $state(untrack(() => i18n.siteTitle));
  let tagline = $state(untrack(() => i18n.tagline));
  let density = $state(untrack(() => initialDensity));
  let collapseLongNotes = $state(untrack(() => initialCollapseLongNotes));
  let busy = $state(false);
  let ready = $state(false);
  let titleError = $state('');
  let taglineError = $state('');
  let message = $state('');
  let error = $state('');

  onMount(() => {
    ready = true;
  });

  // One Save for the whole General tab: every field is validated, then saved together.
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    titleError = '';
    taglineError = '';
    const title = siteTitleSchema.safeParse(siteTitle);
    const tag = taglineSchema.safeParse(tagline);
    const spacing = densitySchema.safeParse(density);
    if (!title.success) titleError = i18n.msg(title.error.issues[0].message);
    if (!tag.success) taglineError = i18n.msg(tag.error.issues[0].message);
    if (!title.success || !tag.success || !spacing.success) return;

    busy = true;
    message = '';
    error = '';
    try {
      const response = await fetch('/api/settings/general', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteTitle: title.data,
          tagline: tag.data,
          density: spacing.data,
          collapseLongNotes,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        error = result.error ? i18n.error(result.error) : t('general.failed');
        return;
      }
      // Apply only confirmed state; reload/SSR uses the same saved settings.
      const saved = result.data;
      i18n.language = saved.language;
      i18n.siteTitle = saved.siteTitle;
      i18n.tagline = saved.tagline;
      document.documentElement.dataset.density = saved.density;
      document.documentElement.dataset.collapse = String(
        saved.collapseLongNotes,
      );
      siteTitle = saved.siteTitle;
      tagline = saved.tagline;
      density = saved.density;
      collapseLongNotes = saved.collapseLongNotes;
      await invalidateAll();
      message = t('general.saved');
    } catch {
      error = t('general.network');
    } finally {
      busy = false;
    }
  }
</script>

<section class="surface" aria-labelledby="general-heading">
  <h2 id="general-heading">{t('general.heading')}</h2>
  <p class="help">{t('general.help')}</p>
  <form onsubmit={save} novalidate>
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

      <label for="general-tagline">{t('general.tagline')}</label>
      <input
        id="general-tagline"
        autocomplete="off"
        bind:value={tagline}
        placeholder={t('brand.tagline')}
        aria-invalid={!!taglineError}
        aria-describedby="general-tagline-help general-tagline-error"
      />
      <p id="general-tagline-help" class="help">{t('general.taglineHelp')}</p>
      <p id="general-tagline-error" class="field-error">{taglineError}</p>

      <label for="general-density">{t('appearance.density')}</label>
      <select id="general-density" bind:value={density}>
        <option value="compact">{t('appearance.compact')}</option>
        <option value="comfortable">{t('appearance.comfortable')}</option>
        <option value="spacious">{t('appearance.spacious')}</option>
      </select>

      <label class="checkbox" for="collapse"
        ><input
          id="collapse"
          type="checkbox"
          bind:checked={collapseLongNotes}
        />{t('appearance.collapse')}</label
      >
      <p class="help">{t('appearance.collapseHelp')}</p>

      <button class="primary" type="submit"
        >{busy ? t('general.saving') : t('general.save')}</button
      >
    </fieldset>
  </form>
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
  label:not(.checkbox) {
    display: block;
    margin-block: var(--space-3) var(--space-1);
  }
  input:not([type='checkbox']) {
    display: block;
    width: min(100%, 26rem);
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
  button {
    margin-top: var(--space-3);
  }
</style>
