<script lang="ts">
  import { onMount } from 'svelte';
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
        message = result.error?.message ?? 'Unable to sign in. Please retry.';
        return;
      }
      password = '';
      if (result.mfaRequired) {
        challenge = result.challenge;
        message =
          'Enter your authenticator code or a single-use recovery code. This challenge expires in five minutes.';
        return;
      }
      code = '';
      challenge = '';
      window.location.assign('/');
    } catch {
      message =
        'Could not reach the server. Your inputs remain here; please retry.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign in — PandaNote</title></svelte:head>
<main>
  <h1>PandaNote</h1>
  <h2>Sign in</h2>
  <form onsubmit={submit}>
    <fieldset disabled={busy || !ready}>
      {#if challenge}
        <label for="mfa-code">Authenticator or recovery code</label>
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
          }}>Start again</button
        >
      {:else}
        <label for="username">Username</label>
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
        <label for="password">Password</label>
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
        >{busy ? 'Please wait…' : challenge ? 'Verify code' : 'Sign in'}</button
      >
    </fieldset>
    <p role="alert">{message}</p>
  </form>
  <noscript>JavaScript is required to submit this authentication form.</noscript
  >
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
