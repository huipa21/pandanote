<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { accountDetailsSchema } from '#lib/shared/auth.ts';
  let {
    initial,
    mfaEnabled,
  }: { initial: { username: string; email: string }; mfaEnabled: boolean } =
    $props();
  let username = $state(untrack(() => initial.username));
  let email = $state(untrack(() => initial.email));
  let password = $state('');
  let code = $state('');
  let busy = $state(false);
  let ready = $state(false);
  let fields = $state<Record<string, string>>({});
  let error = $state('');
  let message = $state('');
  onMount(() => {
    ready = true;
  });
  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      fields = result.error?.fields ?? {};
      throw new Error(result.error?.message ?? 'Could not update account.');
    }
    return result;
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';
    message = '';
    fields = {};
    const parsed = accountDetailsSchema.safeParse({ username, email });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0])] ??= issue.message;
      return;
    }
    busy = true;
    try {
      const fresh = await post('/api/auth/fresh', {
        scope: 'account-update',
        password,
        ...(mfaEnabled ? { code } : {}),
      });
      password = '';
      code = '';
      const result = await post('/api/auth/account', {
        ...parsed.data,
        grant: fresh.grant,
      });
      username = result.account.username;
      email = result.account.email;
      message =
        'Account saved. Use this username the next time you sign in. Current sessions remain signed in.';
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Connection failed. Your account details remain here; retry.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="surface" aria-labelledby="account-heading">
  <h2 id="account-heading">Account</h2>
  <p class="help">
    Changing username or email requires fresh authentication. Email is not
    verified; no email is sent.
  </p>
  <form onsubmit={submit} novalidate>
    <fieldset disabled={busy || !ready}>
      <label for="account-username">Account username</label><input
        id="account-username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        bind:value={username}
        aria-invalid={!!fields.username}
        aria-describedby="account-username-error"
      />
      <p id="account-username-error" class="field-error">
        {fields.username ?? ''}
      </p>
      <label for="account-email">Account email</label><input
        id="account-email"
        type="email"
        autocomplete="email"
        bind:value={email}
        aria-invalid={!!fields.email}
        aria-describedby="account-email-error"
      />
      <p id="account-email-error" class="field-error">{fields.email ?? ''}</p>
      <label for="account-password">Password to update account</label><input
        id="account-password"
        type="password"
        autocomplete="current-password"
        bind:value={password}
      />
      {#if mfaEnabled}<label for="account-code"
          >Account authenticator or recovery code</label
        ><input
          id="account-code"
          autocomplete="one-time-code"
          maxlength="80"
          bind:value={code}
        />{/if}
      <button class="primary" type="submit"
        >{busy ? 'Saving…' : 'Authenticate and save account'}</button
      >
    </fieldset>
  </form>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
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
  button {
    margin-top: var(--space-3);
  }
</style>
