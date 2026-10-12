<script lang="ts">
  import { onMount } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import PageTitle from '#lib/components/PageTitle.svelte';
  const i18n = useI18n();
  const t = i18n.t;
  import { setupAccountSchema } from '#lib/shared/auth.ts';
  let { data } = $props();
  let ready = $state(false);
  onMount(() => {
    // The setup link carries the code in the fragment (#code=…). Browsers do not send
    // a fragment to the server or in Referer. Read it, then remove it from the URL.
    const code = new URLSearchParams(location.hash.slice(1)).get('code');
    if (code) setupCode = code;
    if (location.hash)
      history.replaceState(null, '', location.pathname + location.search);
    ready = true;
  });
  let setupCode = $state('');
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let busy = $state(false);
  let expired = $state(false);
  let already = $state(false);
  let message = $state('');
  let fields = $state<Record<string, string>>({});
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    fields = {};
    message = '';
    const value = { username, email, password, passwordConfirm, setupCode };
    const parsed = setupAccountSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0])] ??= issue.message;
      return;
    }
    busy = true;
    try {
      const response = await fetch('/api/setup/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        fields = result.error?.fields ?? {};
        expired = result.error?.code === 'setup_closed';
        already = result.error?.code === 'already_set_up';
        message =
          result.error?.code === 'already_set_up'
            ? t('setup.alreadySetUp')
            : (result.error?.message ?? t('setup.createFailed'));
        return;
      }
      password = '';
      passwordConfirm = '';
      window.location.assign('/setup/preferences');
    } catch {
      message = t('setup.network');
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle title={t('setup.title')} />
<main class="auth-page">
  <h1 class="site-title" title={i18n.siteTitle}>{i18n.siteTitle}</h1>
  <h2>{t('setup.heading')}</h2>
  {#if !data.windowOpen || expired}
    <p role="alert">
      {t('setup.timedOut')}
      <code>docker compose restart pandanote</code>
    </p>
  {:else}
    <p>{t('setup.intro')}</p>
    <form onsubmit={submit} novalidate>
      <fieldset disabled={busy || !ready || already}>
        <label for="setup-code">{t('setup.code')}</label>
        <input
          id="setup-code"
          name="setupCode"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          bind:value={setupCode}
          aria-invalid={!!fields.setupCode}
          aria-describedby="setup-code-error setup-code-help"
        />
        <p id="setup-code-error" class="field-error">
          {fields.setupCode ?? ''}
        </p>
        <p id="setup-code-help">
          {t('setup.codeHelp')} <code>docker compose logs pandanote</code>
        </p>
        <label for="setup-username">{t('setup.username')}</label>
        <input
          id="setup-username"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          bind:value={username}
          aria-invalid={!!fields.username}
          aria-describedby="username-error"
        />
        <p id="username-error" class="field-error">{fields.username ?? ''}</p>
        <label for="setup-email">{t('setup.email')}</label>
        <input
          id="setup-email"
          name="email"
          type="email"
          autocomplete="email"
          bind:value={email}
          aria-invalid={!!fields.email}
          aria-describedby="email-error email-help"
        />
        <p id="email-error" class="field-error">{fields.email ?? ''}</p>
        <p id="email-help">{t('setup.emailHelp')}</p>
        <label for="setup-password">{t('setup.password')}</label>
        <input
          id="setup-password"
          name="password"
          type="password"
          autocomplete="new-password"
          bind:value={password}
          aria-invalid={!!fields.password}
          aria-describedby="password-error password-help"
        />
        <p id="password-error" class="field-error">{fields.password ?? ''}</p>
        <p id="password-help">{t('setup.passwordHelp')}</p>
        <label for="setup-confirm">{t('setup.confirm')}</label>
        <input
          id="setup-confirm"
          name="passwordConfirm"
          type="password"
          autocomplete="new-password"
          bind:value={passwordConfirm}
          aria-invalid={!!fields.passwordConfirm}
          aria-describedby="confirm-error"
        />
        <p id="confirm-error" class="field-error">
          {fields.passwordConfirm ?? ''}
        </p>
        <button class="primary" type="submit"
          >{busy ? t('setup.creating') : t('setup.create')}</button
        >
      </fieldset>
    </form>
  {/if}
  {#if message}<p role="alert">{message}</p>{/if}
  <a href="/login">{t('setup.signInLink')}</a>
  <noscript>{t('setup.noscript')}</noscript>
</main>
