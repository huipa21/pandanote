<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  const workspace = getContext<EditorWorkspace | undefined>(EDITOR_WORKSPACE);
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { FreshAuthScope, SecurityStatusDto } from '#lib/shared/auth.ts';
  const t = useI18n().t;
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
  let failed = $state(0);
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
      throw new Error(result.error?.message ?? t('security.actionFailed'));
    return result;
  }
  async function refresh() {
    try {
      const status = await request('/api/auth/security');
      mfa = status.mfaEnabled;
      const summary = status as SecurityStatusDto;
      remaining = summary.recoveryCodesRemaining;
      failed = summary.failedSecondFactorAttempts;
      days = summary.sessionLifetimeDays;
      loaded = true;
    } catch {
      error = t('security.loadFailed');
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
          ? t('security.confirmRevoke')
          : action === 'disable'
            ? t('security.confirmDisable')
            : t('security.confirmRegenerate'),
      )
    )
      return;
    if (
      action === 'revoke' &&
      workspace &&
      !(await workspace.promptUnsavedChanges())
    )
      return;
    busy = true;
    error = '';
    message = '';
    codes = [];
    try {
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
          ? t('security.enrollNotActive')
          : t('security.updated');
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : t('security.connection');
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
      message = t('security.mfaEnabledMsg');
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : t('security.confirmFailed');
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
      error = t('security.cancelFailed');
    } finally {
      busy = false;
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([t('security.recoveryFileHeader') + codes.join('\n') + '\n'], {
        type: 'text/plain',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pandanote-recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<h2>{t('security.heading')}</h2>
{#if loaded}
  <p>
    {t('security.mfaStatus', {
      state: mfa ? t('security.enabled') : t('security.disabled'),
    })}{mfa ? ` ${t('security.recoveryRemaining', { count: remaining })}` : ''}
  </p>
  <p class="help">
    {t('security.help')}
  </p>
  {#if failed > 0}
    <p class="notice" data-testid="second-factor-failures">
      {failed === 1
        ? t('security.failedOne')
        : t('security.failedMany', { count: failed })}
    </p>
  {/if}
  {#if !enrollment}
    <form onsubmit={submit}>
      <fieldset disabled={busy}>
        <label for="security-action">{t('security.action')}</label>
        <select id="security-action" bind:value={action}>
          <option value="enroll"
            >{mfa ? t('security.optChange') : t('security.optEnable')}</option
          >
          {#if mfa}<option value="disable">{t('security.optDisable')}</option
            ><option value="regenerate">{t('security.optRegenerate')}</option
            >{/if}
          <option value="password">{t('security.optPassword')}</option><option
            value="lifetime">{t('security.optLifetime')}</option
          ><option value="revoke">{t('security.optRevoke')}</option>
        </select>
        <label for="security-password">{t('security.currentPassword')}</label>
        <input
          id="security-password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          maxlength="256"
        />
        {#if mfa}<label for="security-code">{t('security.codeLabel')}</label
          ><input
            id="security-code"
            autocomplete="one-time-code"
            bind:value={code}
            required
            maxlength="80"
          />{/if}
        {#if action === 'password'}<label for="new-password"
            >{t('security.newPassword')}</label
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
            {t('security.passwordHelp')}
          </p>{/if}
        {#if action === 'lifetime'}<label for="session-days"
            >{t('security.sessionDays')}</label
          ><input
            id="session-days"
            type="number"
            min="1"
            max="30"
            bind:value={days}
            required
          />{/if}
        <button class="primary" type="submit"
          >{busy ? t('auth.wait') : t('security.authContinue')}</button
        >
      </fieldset>
    </form>
  {:else}
    <h3>{t('security.confirmTitle')}</h3>
    <p>
      {t('security.enrollHelp')}
    </p>
    <svg
      class="qr"
      viewBox={`0 0 ${enrollment.qr.length + 8} ${enrollment.qr.length + 8}`}
      role="img"
      aria-label={t('security.qrLabel')}
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
      {t('security.manualSecret')}
      <code data-testid="enrollment-secret">{enrollment.secret}</code>
    </p>
    <form onsubmit={confirm}>
      <fieldset disabled={busy}>
        <label for="enrollment-code">{t('security.newCode')}</label><input
          id="enrollment-code"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern={'[0-9]{6}'}
          maxlength="6"
          bind:value={confirmation}
          required
        />
        <button class="primary" type="submit">{t('security.confirmMfa')}</button
        ><button type="button" onclick={cancel}
          >{t('security.cancelEnroll')}</button
        >
      </fieldset>
    </form>
  {/if}
  <button onclick={refresh} disabled={busy}>{t('security.refresh')}</button>
{:else}<button onclick={refresh} disabled={busy}
    >{t('security.retryLoad')}</button
  >{/if}
{#if codes.length}
  <section class="recovery" aria-label={t('security.codesLabel')}>
    <h3>{t('security.codesTitle')}</h3>
    <p>
      {t('security.codesHelp')}
    </p>
    <ol>
      {#each codes as value (value)}<li><code>{value}</code></li>{/each}
    </ol>
    <button onclick={download}>{t('security.downloadCodes')}</button><button
      onclick={() => {
        if (window.confirm(t('security.savedConfirm'))) codes = [];
      }}>{t('security.savedCodes')}</button
    >
  </section>
{/if}
{#if message}<p role="status">{message}</p>{/if}{#if error}<p role="alert">
    {error}
  </p>{/if}
<p class="help">
  {t('security.lostAccess')}
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
  .notice {
    color: var(--danger);
    font-weight: 600;
  }
</style>
