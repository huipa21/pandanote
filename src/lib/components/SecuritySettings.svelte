<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  const workspace = getContext<DraftWorkspace | undefined>(DRAFT_WORKSPACE);
  import type { FreshAuthScope } from '#lib/shared/auth.ts';
  type Action =
    'enroll' | 'disable' | 'regenerate' | 'password' | 'revoke' | 'lifetime';
  const scopes: Record<Action, FreshAuthScope> = {
    enroll: 'mfa-enroll',
    disable: 'mfa-disable',
    regenerate: 'recovery-regenerate',
    password: 'password-change',
    revoke: 'sessions-revoke',
    lifetime: 'session-lifetime',
  };
  let mfa = $state(false);
  let remaining = $state(0);
  let days = $state(7);
  let loaded = $state(false);
  let busy = $state(false);
  let action = $state<Action>('enroll');
  let password = $state('');
  let code = $state('');
  let newPassword = $state('');
  let confirmation = $state('');
  let enrollment = $state<{
    secret: string;
    uri: string;
    qr: boolean[][];
    challenge: string;
    expiresAt: number;
  } | null>(null);
  let codes = $state<string[]>([]);
  let error = $state('');
  let message = $state('');
  async function request(path: string, body?: unknown) {
    const response = await fetch(
      path,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(
        result.error?.message ?? 'Could not complete security action.',
      );
    return result;
  }
  async function refresh() {
    try {
      const status = await request('/api/auth/security');
      mfa = status.mfaEnabled;
      remaining = status.recoveryCodesRemaining;
      days = status.sessionLifetimeDays;
      loaded = true;
    } catch {
      error = 'Could not load security settings. Retry loading.';
    }
  }
  onMount(() => {
    void refresh();
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !loaded) return;
    if (
      ['disable', 'regenerate', 'revoke'].includes(action) &&
      !window.confirm(
        action === 'revoke'
          ? 'Sign out all devices, including this one? Local drafts remain on this device.'
          : action === 'disable'
            ? 'Disable MFA and invalidate all recovery codes?'
            : 'Invalidate every old recovery code and generate ten new ones?',
      )
    )
      return;
    busy = true;
    error = '';
    message = '';
    codes = [];
    try {
      if (action === 'revoke' && workspace && !(await workspace.flush()))
        throw new Error(
          'Local edits are not safely saved. Keep another copy or resolve the draft warning before signing out. Drafts remain on this device.',
        );
      const fresh = await request('/api/auth/fresh', {
        scope: scopes[action],
        password,
        ...(mfa ? { code } : {}),
      });
      password = '';
      code = '';
      const result = await request('/api/auth/security', {
        action,
        grant: fresh.grant,
        ...(action === 'password' ? { password: newPassword } : {}),
        ...(action === 'lifetime' ? { days } : {}),
      });
      newPassword = '';
      if (action === 'revoke') {
        window.location.assign('/login');
        return;
      }
      if (result.enrollment) {
        enrollment = result.enrollment;
        confirmation = '';
      }
      if (result.codes) codes = result.codes;
      message =
        action === 'enroll'
          ? 'MFA is not activated until you confirm the new authenticator code.'
          : 'Security updated. Other devices have been signed out.';
      await refresh();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Connection failed. Check security status before retrying. If recovery codes were not received, regenerate them.';
    } finally {
      busy = false;
    }
  }
  async function confirm(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !enrollment) return;
    busy = true;
    error = '';
    message = '';
    try {
      const result = await request('/api/auth/security', {
        action: 'confirm',
        challenge: enrollment.challenge,
        code: confirmation,
      });
      codes = result.codes;
      enrollment = null;
      confirmation = '';
      message = 'MFA enabled. Other devices have been signed out.';
      await refresh();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Could not confirm. Check security status and retry.';
    } finally {
      busy = false;
    }
  }
  async function cancel() {
    if (busy) return;
    busy = true;
    try {
      await request('/api/auth/security', { action: 'cancel-enrollment' });
      enrollment = null;
      confirmation = '';
    } catch {
      error =
        'Could not cancel enrollment. Retry, or wait five minutes for it to expire.';
    } finally {
      busy = false;
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          'PandaNote single-use recovery codes\nKeep private. Each code replaces TOTP, not your password.\n\n' +
            codes.join('\n') +
            '\n',
        ],
        { type: 'text/plain' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pandanote-recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<h2>Security & session</h2>
{#if loaded}
  <p>
    MFA: {mfa ? 'enabled' : 'disabled'}. {mfa
      ? `${remaining} recovery codes remaining.`
      : ''}
  </p>
  <p class="help">
    Security actions require your password and, when enabled, an unused
    authenticator or recovery code. Authenticator codes use 30-second steps with
    ±one step clock drift; accepted codes cannot be reused. Wait for the next
    code after enrollment.
  </p>
  {#if !enrollment}
    <form onsubmit={submit}>
      <fieldset disabled={busy}>
        <label for="security-action">Security action</label>
        <select id="security-action" bind:value={action}>
          <option value="enroll"
            >{mfa ? 'Change authenticator' : 'Enable MFA'}</option
          >
          {#if mfa}<option value="disable">Disable MFA</option><option
              value="regenerate">Regenerate recovery codes</option
            >{/if}
          <option value="password">Change password</option><option
            value="lifetime">Change session lifetime</option
          ><option value="revoke">Sign out all devices</option>
        </select>
        <label for="security-password">Current password</label>
        <input
          id="security-password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          maxlength="256"
        />
        {#if mfa}<label for="security-code"
            >Authenticator or recovery code</label
          ><input
            id="security-code"
            autocomplete="one-time-code"
            bind:value={code}
            required
            maxlength="80"
          />{/if}
        {#if action === 'password'}<label for="new-password">New password</label
          ><input
            id="new-password"
            type="password"
            autocomplete="new-password"
            bind:value={newPassword}
            required
            maxlength="256"
            aria-describedby="new-password-help"
          />
          <p id="new-password-help" class="help">
            Use 8–128 characters. Spaces count; no complexity rules.
          </p>{/if}
        {#if action === 'lifetime'}<label for="session-days"
            >Session lifetime (days)</label
          ><input
            id="session-days"
            type="number"
            min="1"
            max="30"
            bind:value={days}
            required
          />{/if}
        <button class="primary" type="submit"
          >{busy ? 'Please wait…' : 'Authenticate and continue'}</button
        >
      </fieldset>
    </form>
  {:else}
    <h3>Confirm authenticator enrollment</h3>
    <p>
      Scan this QR code in your authenticator, or enter the secret manually.
      Keep it private. Enrollment expires in five minutes; your existing MFA
      stays unchanged until confirmation.
    </p>
    <svg
      class="qr"
      viewBox={`0 0 ${enrollment.qr.length + 8} ${enrollment.qr.length + 8}`}
      role="img"
      aria-label="Authenticator enrollment QR code"
      shape-rendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="white" />
      {#each enrollment.qr as row, y (y)}{#each row as dark, x (x)}{#if dark}<rect
              x={x + 4}
              y={y + 4}
              width="1"
              height="1"
              fill="black"
            />{/if}{/each}{/each}
    </svg>
    <p>
      Manual secret: <code data-testid="enrollment-secret"
        >{enrollment.secret}</code
      >
    </p>
    <form onsubmit={confirm}>
      <fieldset disabled={busy}>
        <label for="enrollment-code">New authenticator code</label><input
          id="enrollment-code"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern={'[0-9]{6}'}
          maxlength="6"
          bind:value={confirmation}
          required
        />
        <button class="primary" type="submit">Confirm MFA</button><button
          type="button"
          onclick={cancel}>Cancel enrollment</button
        >
      </fieldset>
    </form>
  {/if}
  <button onclick={refresh} disabled={busy}>Refresh security status</button>
{:else}<button onclick={refresh} disabled={busy}>Retry loading security</button
  >{/if}
{#if codes.length}
  <section class="recovery" aria-label="New recovery codes">
    <h3>Save your ten recovery codes now</h3>
    <p>
      Shown only at generation. Each works once with your password. Regeneration
      invalidates the old set. These codes and browser-local drafts do not
      protect a compromised browser; downloaded backups are also sensitive and
      unencrypted.
    </p>
    <ol>
      {#each codes as value (value)}<li><code>{value}</code></li>{/each}
    </ol>
    <button onclick={download}>Download recovery codes</button><button
      onclick={() => {
        if (
          window.confirm(
            'Have you saved the recovery codes? They cannot be shown again.',
          )
        )
          codes = [];
      }}>I saved these codes</button
    >
  </section>
{/if}
{#if message}<p role="status">{message}</p>{/if}{#if error}<p role="alert">
    {error}
  </p>{/if}
<p class="help">
  Lost all access? Recovery requires the documented operator command on the VPS.
  There is no public reset or MFA bypass.
</p>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  label {
    display: block;
    margin-block: var(--space-3) var(--space-1);
  }
  input,
  select {
    width: min(100%, 26rem);
    display: block;
  }
  button {
    margin: var(--space-3) var(--space-2) 0 0;
  }
  code {
    overflow-wrap: anywhere;
  }
  .qr {
    width: min(100%, 17rem);
    height: auto;
  }
  .recovery {
    border: 1px solid var(--control-border);
    padding: var(--space-3);
    margin-top: var(--space-4);
  }
  [role='alert'] {
    color: var(--danger);
  }
</style>
