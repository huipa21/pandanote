<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Modal from './Modal.svelte';
  import RestoreSettings from './RestoreSettings.svelte';
  import { idSchema } from '#lib/shared/domain.ts';
  import type { BackupJob } from '#lib/shared/backups.ts';
  let jobs = $state<BackupJob[]>([]);
  let ready = $state(false);
  let busy = $state(false);
  let open = $state(false);
  let selected = $state('');
  let error = $state('');
  let message = $state('');
  let retryId = $state('');
  const retryKey = 'pandanote:backup-create:v1';
  let downloadForm: HTMLFormElement;
  let downloadPath = $state('');
  let refreshing = false;
  const lifetime = new AbortController();
  async function request(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(path, {
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]),
      ...(body === undefined
        ? {}
        : {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(
        result.error?.message ??
          'Backup request failed. Refresh before retrying.',
      );
    return result;
  }
  async function refresh() {
    if (refreshing || lifetime.signal.aborted) return;
    refreshing = true;
    try {
      jobs = (await request('/api/backups')).data;
      ready = true;
      if (retryId && jobs.some((job) => job.id === retryId)) {
        sessionStorage.removeItem(retryKey);
        retryId = '';
      }
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Could not load backups. Retry refresh.';
    } finally {
      refreshing = false;
    }
  }
  onMount(() => {
    try {
      const stored = sessionStorage.getItem(retryKey);
      if (stored && idSchema.safeParse(stored).success) retryId = stored;
    } catch {
      error =
        'Browser retry storage is unavailable. Backup creation will not send until retry identity can be retained.';
    }
    void refresh();
    const timer = setInterval(() => {
      if (
        jobs.some((job) =>
          ['pending', 'capturing', 'archiving'].includes(job.state),
        )
      )
        void refresh();
    }, 2000);
    return () => {
      clearInterval(timer);
      lifetime.abort();
    };
  });
  // Session and same-origin checks protect these actions; no password prompt (owner decision).
  // Retry identity is a content-free UUID; idempotent by ID on the server.
  async function startBackup() {
    if (busy) return;
    busy = true;
    error = '';
    message = '';
    try {
      retryId ||= crypto.randomUUID();
      sessionStorage.setItem(retryKey, retryId);
      await request('/api/backups', { id: retryId });
      sessionStorage.removeItem(retryKey);
      retryId = '';
      message =
        'Manual backup started. It is downloadable only after verification completes.';
      await refresh();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Connection failed. Refresh the backup list before retrying.';
    } finally {
      busy = false;
    }
  }
  async function startDownload(id: string) {
    if (busy) return;
    error = '';
    // Native form avoids a multi-GB fetch/blob in browser memory. Form has no fields.
    downloadPath = `/api/backups/${id}/download`;
    await tick();
    downloadForm.submit();
    message =
      'Download requested. Check browser downloads; any server error opens separately.';
  }
  function askDelete(id: string) {
    if (busy) return;
    selected = id;
    error = '';
    message = '';
    open = true;
  }
  async function confirmDelete(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    message = '';
    try {
      await request(`/api/backups/${selected}`, { confirmed: true }, 'DELETE');
      open = false;
      message = 'Backup or failed job deleted.';
      await refresh();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Connection failed. Refresh the backup list before retrying.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="surface" data-testid="backup-settings">
  <h2>Backup & Restore</h2>
  <p class="warning">
    Archives are unencrypted and contain private notes, files, password hashes,
    MFA secrets, recovery-code hashes and portable authentication keys. Keep
    them protected. There is no separate backup password.
  </p>
  <p class="help">
    Only manual full backups are created. A server-local copy does not protect
    against losing the VPS: download it and keep it safely elsewhere. Unsaved
    editor text and files are not included. Uploaded restores replace
    application data only after validation and explicit fresh-auth confirmation.
  </p>
  <div class="actions">
    <button
      class="primary"
      disabled={!ready ||
        busy ||
        jobs.some((job) =>
          ['pending', 'capturing', 'archiving'].includes(job.state),
        )}
      onclick={startBackup}
      >{retryId ? 'Retry backup request' : 'Create full backup'}</button
    >
    <button disabled={busy} onclick={refresh}>Refresh backups</button>
  </div>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if ready && !jobs.length}<p>No server backups yet.</p>{/if}
  <p class="help">
    Newest 100 jobs. Snapshot capture briefly pauses mutations; reading remains
    available. Interrupted jobs fail rather than resume automatically.
  </p>
  <ul>
    {#each jobs as job (job.id)}
      <li data-backup-id={job.id}>
        <time datetime={new Date(job.createdAt).toISOString()}
          >{new Date(job.createdAt).toLocaleString()}</time
        >
        <span
          >{job.state} · {job.progress}%{job.bytes === null
            ? ''
            : ` · ${job.bytes.toLocaleString()} bytes`}</span
        >
        {#if job.errorCode}<p>
            Failed: {job.errorCode}. Free space if needed, refresh, then create
            a new backup.
          </p>{/if}
        {#if job.state === 'complete'}<button
            disabled={busy}
            onclick={() => startDownload(job.id)}>Download backup</button
          >{/if}
        {#if ['complete', 'failed'].includes(job.state)}<button
            class="danger"
            disabled={busy}
            onclick={() => askDelete(job.id)}>Delete backup</button
          >{/if}
      </li>
    {/each}
  </ul>
  <RestoreSettings />
  <form
    bind:this={downloadForm}
    action={downloadPath}
    method="POST"
    target="_blank"
    rel="noopener"
    hidden
  ></form>
</section>
<Modal bind:open title="Delete backup?" dismissible={!busy}>
  <p>
    Permanently delete this server backup or failed job? Downloaded copies are
    not deleted.
  </p>
  <form onsubmit={confirmDelete}>
    <fieldset disabled={busy}>
      <button class="danger" type="submit"
        >{busy ? 'Deleting…' : 'Confirm delete backup'}</button
      >
    </fieldset>
    <p role="alert">{error}</p>
  </form>
</Modal>

<style>
  h2 {
    margin-top: 0;
  }
  .warning {
    color: var(--text);
    border-left: 3px solid var(--warning);
    padding-left: var(--space-3);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    border-top: 1px solid var(--border);
    padding-block: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    overflow-wrap: anywhere;
  }
  li time,
  li span,
  li p {
    flex-basis: 100%;
  }
  fieldset {
    border: 0;
    padding: 0;
    min-width: 0;
  }
</style>
