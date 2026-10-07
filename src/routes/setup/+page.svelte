<script lang="ts">
  import { onMount } from 'svelte';
  import { setupAccountSchema } from '#lib/shared/auth.ts';
  let { data } = $props();
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
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
    const value = { username, email, password, passwordConfirm };
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
          result.error?.message ?? 'Could not create account. Please retry.';
        return;
      }
      password = '';
      passwordConfirm = '';
      window.location.assign('/setup/preferences');
    } catch {
      message =
        'Could not reach the server. Inputs remain here. Retry, or sign in if the account was created.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Set up — PandaNote</title></svelte:head>
<main class="auth-page">
  <h1>PandaNote</h1>
  <h2>Set up your notebook</h2>
  {#if !data.windowOpen || expired}
    <p role="alert">
      Setup has timed out. Restart PandaNote on the server to open it again (<code
        >docker compose restart pandanote</code
      >).
    </p>
  {:else}
    <p>
      Step 1 of 2. Setup is open for 60 minutes after the server starts. The
      first visitor to create an account owns this notebook.
    </p>
    <form onsubmit={submit} novalidate>
      <fieldset disabled={busy || !ready || already}>
        <label for="setup-username">Username</label>
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
        <label for="setup-email">Email</label>
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
        <p id="email-help">
          Required for future use; not verified. No email is sent.
        </p>
        <label for="setup-password">Password</label>
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
        <p id="password-help">
          Use 8–128 characters. Spaces count; no complexity rules.
        </p>
        <label for="setup-confirm">Re-enter password</label>
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
          >{busy ? 'Creating account…' : 'Create account'}</button
        >
      </fieldset>
    </form>
  {/if}
  {#if message}<p role="alert">{message}</p>{/if}
  <a href="/login">Already created your account? Sign in</a>
  <noscript>JavaScript is required to submit this form.</noscript>
</main>
