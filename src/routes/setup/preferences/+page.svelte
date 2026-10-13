<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import { setupPreferencesSchema } from '#lib/shared/auth.ts';
  import {
    languages,
    languageInfo,
    browserLanguage,
    type Language,
  } from '#lib/shared/i18n/registry.ts';
  let { data } = $props();
  const i18n = useI18n();
  const t = i18n.t;
  let siteTitle = $state(untrack(() => data.siteTitle));
  let language = $state<Language>(untrack(() => i18n.language));
  let timezone = $state('UTC');
  let ready = $state(false);
  let busy = $state(false);
  let message = $state('');
  let fields = $state<Record<string, string>>({});
  onMount(() => {
    language = browserLanguage(navigator.languages);
    i18n.language = language;
    const proposed = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (setupPreferencesSchema.shape.timezone.safeParse(proposed).success)
      timezone = proposed;
    ready = true;
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    fields = {};
    message = '';
    const value = { siteTitle, language, timezone };
    const parsed = setupPreferencesSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0])] ??= i18n.msg(issue.message);
      return;
    }
    busy = true;
    try {
      const response = await fetch('/api/setup/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        fields = i18n.msgs(result.error?.fields);
        message = result.error?.message ?? t('prefs.failed');
        return;
      }
      window.location.assign('/');
    } catch {
      message = t('prefs.network');
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle title={t('prefs.title')} />
<main class="auth-page">
  <h1>{t('prefs.heading')}</h1>
  <p>{t('prefs.intro')}</p>
  <form onsubmit={submit} novalidate>
    <fieldset disabled={busy || !ready}>
      <label for="site-title">{t('prefs.siteTitle')}</label><input
        id="site-title"
        bind:value={siteTitle}
        aria-invalid={!!fields.siteTitle}
        aria-describedby="title-error"
      />
      <p id="title-error" class="field-error">{fields.siteTitle ?? ''}</p>
      <label for="language">{t('prefs.language')}</label><select
        id="language"
        bind:value={language}
        onchange={(event) => {
          // Preview the chosen language; it is only saved by Finish setup.
          i18n.language = event.currentTarget.value as Language;
        }}
        aria-describedby="language-help language-error"
      >
        {#each languages as item (item.code)}<option value={item.code}
            >{item.nativeName}</option
          >{/each}
      </select>
      <p id="language-error" class="field-error">{fields.language ?? ''}</p>
      <p id="language-help">
        {#if !languageInfo(language).complete}{t('general.partial')}{/if}
      </p>
      <label for="timezone">{t('prefs.timezone')}</label><input
        id="timezone"
        bind:value={timezone}
        aria-invalid={!!fields.timezone}
        aria-describedby="timezone-error"
      />
      <p id="timezone-error" class="field-error">{fields.timezone ?? ''}</p>
      <button class="primary" type="submit"
        >{busy ? t('prefs.saving') : t('prefs.finish')}</button
      >
    </fieldset>
  </form>
  {#if message}<p role="alert">{message}</p>{/if}
  <noscript>{t('setup.noscript')}</noscript>
</main>
