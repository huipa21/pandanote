<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import type { RestoreSummary } from '#lib/shared/restores.ts';
  import { BACKUP_MAX_BYTES } from '#lib/shared/backups.ts';
  let file = $state<File | null>(null);
  let summary = $state<RestoreSummary | null>(null);
  let ready = $state(false),
    busy = $state(false),
    open = $state(false);
  let action = $state<'upload' | 'replace'>('upload');
  let password = $state(''),
    code = $state(''),
    mfa = $state(false);
  let confirmed = $state(false),
    error = $state(''),
    progress = $state('');
  const lifetime = new AbortController();
  let transfer: XMLHttpRequest | undefined;
  async function json(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(path, {
      signal: AbortSignal.any([
        lifetime.signal,
        AbortSignal.timeout(path.endsWith('/confirm') ? 600_000 : 15_000),
      ]),
      ...(body === undefined && method === 'POST'
        ? {}
        : {
            method,
            headers: { 'content-type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(result.error?.message ?? 'Restore request failed.');
    return result;
  }
  onMount(() => {
    void json('/api/restores')
      .then((result) => {
        summary = result.data;
        ready = true;
      })
      .catch((e) => {
        error = e.message;
        ready = true;
      });
    return () => {
      lifetime.abort();
      transfer?.abort();
      password = '';
      code = '';
    };
  });
  async function choose(next: typeof action) {
    busy = true;
    error = '';
    confirmed = false;
    password = '';
    code = '';
    action = next;
    try {
      mfa = (await json('/api/auth/security')).mfaEnabled;
      open = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load security state.';
    } finally {
      busy = false;
    }
  }
  function upload(grant: string, archive: File): Promise<RestoreSummary> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      transfer = xhr;
      xhr.open('POST', '/api/restores');
      xhr.timeout = 1_200_000;
      xhr.setRequestHeader('content-type', 'application/octet-stream');
      xhr.setRequestHeader('x-archive-bytes', String(archive.size));
      xhr.setRequestHeader('x-restore-grant', grant);
      xhr.upload.onprogress = (event) => {
        progress = `Uploading archive: ${event.loaded.toLocaleString()} of ${archive.size.toLocaleString()} bytes`;
      };
      xhr.upload.onload = () => {
        progress =
          'Validating checksums, database, keys, references and staged search. Current data is unchanged.';
      };
      xhr.onload = () => {
        transfer = undefined;
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 400 || !result.ok)
            throw new Error(result.error?.message ?? 'Invalid archive.');
          resolve(result.data);
        } catch (e) {
          reject(e);
        }
      };
      const failed = () => {
        transfer = undefined;
        reject(
          new Error(
            'Archive upload interrupted. Current data is unchanged; select the archive and retry.',
          ),
        );
      };
      xhr.onerror = failed;
      xhr.ontimeout = failed;
      xhr.onabort = failed;
      xhr.send(archive);
    });
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || (action === 'replace' && !confirmed)) return;
    busy = true;
    error = '';
    try {
      const fresh = await json('/api/auth/fresh', {
        scope: 'restore',
        password,
        ...(mfa ? { code } : {}),
      });
      password = '';
      code = '';
      if (action === 'upload') {
        if (!file || file.size <= 0 || file.size > BACKUP_MAX_BYTES)
          throw new Error('Select a supported-size PandaNote .pnb archive.');
        summary = await upload(fresh.grant, file);
        progress =
          'Archive validated. Nothing has been replaced. Inspect the summary before confirming.';
        open = false;
      } else {
        if (!summary) throw new Error('Upload and validate an archive first.');
        progress =
          'Replacing application data. Wait for completion; all sessions will be invalidated.';
        await json('/api/restores/confirm', {
          id: summary.id,
          grant: fresh.grant,
          confirmed: true,
        });
        // Full navigation drops old private state; browser recovery storage stays.
        window.location.assign('/login');
      }
    } catch (e) {
      error =
        (e instanceof Error ? e.message : 'Restore request failed.') +
        (action === 'replace'
          ? ' If the connection was lost, sign in to check the result before retrying. A successful restore requires the archived account.'
          : '');
      progress = '';
    } finally {
      busy = false;
    }
  }
  async function discard() {
    busy = true;
    error = '';
    try {
      await json('/api/restores', undefined, 'DELETE');
      summary = null;
      progress = 'Validated upload discarded. Current data is unchanged.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not discard upload.';
    } finally {
      busy = false;
    }
  }
</script>

<div data-testid="restore-settings">
  <h3>Restore uploaded full backup</h3>
  <p>
    Upload a PandaNote .pnb archive to validate it privately. Replacement is
    destructive, not a merge. Notes, files, settings and account credentials are
    replaced; all devices must sign in again with the restored password and MFA.
    Destination domain and unrelated server backups are kept.
  </p>
  <p class="help">
    Browser-local drafts remain untouched and must be checked against restored
    server versions. Restart discards unconfirmed uploads. If restore fails, the
    previous state is rolled back; see the operator restore runbook if startup
    requires recovery.
  </p>
  <label for="restore-archive">PandaNote backup archive</label>
  <input
    id="restore-archive"
    type="file"
    accept=".pnb"
    disabled={!ready || busy}
    onchange={(event) => {
      file = event.currentTarget.files?.[0] ?? null;
    }}
  />
  <div class="actions">
    <button disabled={!ready || busy || !file} onclick={() => choose('upload')}
      >Upload and validate backup</button
    >
    {#if summary}<button
        class="danger"
        disabled={busy}
        onclick={() => choose('replace')}
        >Replace application from backup</button
      >
      <button disabled={busy} onclick={discard}>Discard validated upload</button
      >{/if}
  </div>
  {#if progress}<p role="status">{progress}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if summary}
    <div class="summary" data-testid="restore-summary">
      <h4>Validated archive summary</h4>
      <p>
        Captured {new Date(summary.createdAt).toLocaleString()} · schema {summary.schemaVersion}
        · {summary.bytes.toLocaleString()} archive bytes
      </p>
      <p>
        {summary.notes} notes: {summary.published} published, {summary.drafts} server
        drafts, {summary.trash} Trash. {summary.attachments} attachments.
      </p>
      <p>
        Restored account MFA: {summary.mfaEnabled ? 'enabled' : 'disabled'}. Use
        the archived account credentials after replacement.
      </p>
    </div>
  {/if}
</div>
<Modal
  bind:open
  title={action === 'upload'
    ? 'Authorize restore upload'
    : 'Confirm full restore'}
  dismissible={!busy}
  onDismiss={() => {
    password = '';
    code = '';
  }}
>
  <p>
    {action === 'upload'
      ? 'Authorize private upload and validation. Current application data will not change.'
      : 'This replaces all current application data, including your password and MFA configuration. It does not merge notes. All active sessions will be invalidated.'}
  </p>
  <form onsubmit={submit}>
    <fieldset disabled={busy}>
      {#if action === 'replace'}<label class="confirmation"
          ><input type="checkbox" required bind:checked={confirmed} /> I understand
          that current application data will be replaced.</label
        >{/if}
      <label for="restore-password">Current password for restore</label>
      <input
        id="restore-password"
        type="password"
        autocomplete="current-password"
        required
        bind:value={password}
      />
      {#if mfa}<label for="restore-code"
          >Current authenticator or recovery code for restore</label
        ><input
          id="restore-code"
          autocomplete="one-time-code"
          required
          bind:value={code}
        />{/if}
      <button
        type="submit"
        class={action === 'replace' ? 'danger' : 'primary'}
        disabled={action === 'replace' && !confirmed}
        >{busy
          ? 'Working…'
          : action === 'upload'
            ? 'Confirm upload and validate'
            : 'Confirm replace all application data'}</button
      >
    </fieldset>
    {#if busy}<p role="status">{progress || 'Authorizing…'}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </form>
</Modal>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-block: var(--space-3);
  }
  .summary {
    border: 1px solid var(--border);
    padding: var(--space-3);
    border-radius: var(--radius);
  }
  fieldset {
    border: 0;
    padding: 0;
    min-width: 0;
  }
  label {
    display: block;
    margin-block: var(--space-3) var(--space-1);
  }
  input {
    width: 100%;
    margin-bottom: var(--space-3);
  }
  .confirmation input {
    width: auto;
  }
</style>
