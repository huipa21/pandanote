<script lang="ts">
  import { onMount } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import PageTitle from './PageTitle.svelte';
  const i18n = useI18n();
  const t = i18n.t;
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  let username = $state('');
  let password = $state('');
  let challenge = $state('');
  let code = $state('');
  let busy = $state(false);
  let message = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    message = '';
    try {
      const response = await fetch(
        challenge ? '/api/auth/mfa' : '/api/auth/login',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            challenge ? { challenge, code } : { username, password },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        const errorCode = result.error?.code;
        if (challenge && errorCode === 'mfa_restart') {
          // The challenge is gone (too many wrong codes or expired): start over.
          challenge = '';
          code = '';
          message = t('auth.mfaRestart');
          return;
        }
        message =
          errorCode === 'unauthorized'
            ? challenge
              ? t('auth.mfaInvalid')
              : t('auth.invalid')
            : result.error
              ? i18n.error(result.error)
              : t('auth.failed');
        return;
      }
      password = '';
      if (result.mfaRequired) {
        challenge = result.challenge;
        message = t('auth.mfaPrompt');
        return;
      }
      code = '';
      challenge = '';
      window.location.assign('/');
    } catch {
      message = t('auth.network');
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle title={t('auth.signIn')} />
<main>
  <h1 class="site-title" title={i18n.siteTitle}>{i18n.siteTitle}</h1>
  <h2>{t('auth.signIn')}</h2>
  <form onsubmit={submit}>
    <fieldset disabled={busy || !ready}>
      {#if challenge}
        <label for="mfa-code">{t('auth.mfaCode')}</label>
        <input
          id="mfa-code"
          autocomplete="one-time-code"
          bind:value={code}
          required
          maxlength="80"
        />
        <button
          type="button"
          onclick={() => {
            challenge = '';
            code = '';
            message = '';
          }}>{t('auth.startAgain')}</button
        >
      {:else}
        <label for="username">{t('auth.username')}</label>
        <input
          id="username"
          name="username"
          autocomplete="username"
          bind:value={username}
          required
          maxlength="32"
          autocapitalize="none"
          spellcheck="false"
        />
        <label for="password">{t('auth.password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          maxlength="256"
        />
      {/if}
      <button type="submit"
        >{busy
          ? t('auth.wait')
          : challenge
            ? t('auth.verify')
            : t('auth.signIn')}</button
      >
    </fieldset>
    <p role="alert">{message}</p>
  </form>
  <noscript>{t('auth.noscript')}</noscript>
</main>

<style>
  main {
    max-width: 28rem;
    margin: 3rem auto;
    padding: 1.25rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  label {
    display: block;
    margin-block: 1rem 0.25rem;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.7rem;
    border: 1px solid var(--control-border);
    border-radius: 0.3rem;
    font: inherit;
  }
  button {
    margin-top: 1rem;
    padding: 0.7rem 1rem;
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
    border-radius: 0.3rem;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: wait;
  }
  :is(input, button):focus-visible {
    outline: var(--focus-width) solid var(--accent);
    outline-offset: 3px;
  }
  [role='alert'] {
    color: var(--danger);
    overflow-wrap: anywhere;
  }
</style>
