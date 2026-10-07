<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { setupPreferencesSchema } from '#lib/shared/auth.ts';
  import {
    languages,
    browserLanguage,
    type Language,
  } from '#lib/shared/i18n/registry.ts';
  let { data } = $props();
  let siteTitle = $state(untrack(() => data.siteTitle));
  let language = $state<Language>('en');
  let timezone = $state('UTC');
  let ready = $state(false);
  let busy = $state(false);
  let message = $state('');
  let fields = $state<Record<string, string>>({});
  onMount(() => {
    language = browserLanguage(navigator.languages);
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
        fields[String(issue.path[0])] ??= issue.message;
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
        fields = result.error?.fields ?? {};
        message =
          result.error?.message ?? 'Could not finish setup. Please retry.';
        return;
      }
      window.location.assign('/');
    } catch {
      message =
        'Could not reach the server. Your choices remain here; please retry.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Preferences — PandaNote</title></svelte:head>
<main class="auth-page">
  <h1>Notebook preferences</h1>
  <p>
    Step 2 of 2. All fields are prefilled. Finish setup to open your notebook.
  </p>
  <form onsubmit={submit} novalidate>
    <fieldset disabled={busy || !ready}>
      <label for="site-title">Site title</label><input
        id="site-title"
        bind:value={siteTitle}
        aria-invalid={!!fields.siteTitle}
        aria-describedby="title-error"
      />
      <p id="title-error" class="field-error">{fields.siteTitle ?? ''}</p>
      <label for="language">Language</label><select
        id="language"
        bind:value={language}
        aria-describedby="language-help language-error"
      >
        {#each languages as item (item.code)}<option value={item.code}
            >{item.nativeName}</option
          >{/each}
      </select>
      <p id="language-error" class="field-error">{fields.language ?? ''}</p>
      <p id="language-help">
        Translation in progress — screens currently use English.
      </p>
      <label for="timezone">Timezone</label><input
        id="timezone"
        bind:value={timezone}
        aria-invalid={!!fields.timezone}
        aria-describedby="timezone-error"
      />
      <p id="timezone-error" class="field-error">{fields.timezone ?? ''}</p>
      <button class="primary" type="submit"
        >{busy ? 'Saving…' : 'Finish setup'}</button
      >
    </fieldset>
  </form>
  {#if message}<p role="alert">{message}</p>{/if}
  <noscript>JavaScript is required to submit this form.</noscript>
</main>
