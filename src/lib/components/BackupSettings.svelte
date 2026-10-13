<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Modal from './Modal.svelte';
  import RestoreSettings from './RestoreSettings.svelte';
  import { idSchema } from '#lib/shared/domain.ts';
  import type { BackupJob } from '#lib/shared/backups.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';
  const i18n = useI18n();
  const t = i18n.t;
  const stateKeys: Record<BackupJob['state'], MessageKey> = {
    pending: 'backup.state.pending',
    capturing: 'backup.state.capturing',
    archiving: 'backup.state.archiving',
    complete: 'backup.state.complete',
    failed: 'backup.state.failed',
  };
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
      throw new Error(result.error?.message ?? t('backup.requestFailed'));
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
      error = e instanceof Error ? e.message : t('backup.loadFailed');
    } finally {
      refreshing = false;
    }
  }
  onMount(() => {
    try {
      const stored = sessionStorage.getItem(retryKey);
      if (stored && idSchema.safeParse(stored).success) retryId = stored;
    } catch {
      error = t('backup.storageUnavailable');
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
      message = t('backup.started');
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : t('backup.connection');
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
    message = t('backup.downloadRequested');
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
      message = t('backup.deleted');
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : t('backup.connection');
    } finally {
      busy = false;
    }
  }
</script>

<section class="surface" data-testid="backup-settings">
  <h2>{t('backup.heading')}</h2>
  <p class="warning">
    {t('backup.warning')}
  </p>
  <p class="help">
    {t('backup.help')}
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
      >{retryId ? t('backup.retryRequest') : t('backup.create')}</button
    >
    <button disabled={busy} onclick={refresh}>{t('backup.refresh')}</button>
  </div>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if ready && !jobs.length}<p>{t('backup.none')}</p>{/if}
  <p class="help">
    {t('backup.listHelp')}
  </p>
  <ul>
    {#each jobs as job (job.id)}
      <li data-backup-id={job.id}>
        <time datetime={new Date(job.createdAt).toISOString()}
          >{new Date(job.createdAt).toLocaleString(i18n.locale)}</time
        >
        <span
          >{t(stateKeys[job.state])} · {job.progress}%{job.bytes === null
            ? ''
            : t('backup.bytes', {
                bytes: job.bytes.toLocaleString(i18n.locale),
              })}</span
        >
        {#if job.errorCode}<p>
            {t('backup.failed', { code: job.errorCode })}
          </p>{/if}
        {#if job.state === 'complete'}<button
            disabled={busy}
            onclick={() => startDownload(job.id)}>{t('backup.download')}</button
          >{/if}
        {#if ['complete', 'failed'].includes(job.state)}<button
            class="danger"
            disabled={busy}
            onclick={() => askDelete(job.id)}>{t('backup.delete')}</button
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
<Modal bind:open title={t('backup.deleteTitle')} dismissible={!busy}>
  <p>
    {t('backup.deleteHelp')}
  </p>
  <form onsubmit={confirmDelete}>
    <fieldset disabled={busy}>
      <button class="danger" type="submit"
        >{busy ? t('backup.deleting') : t('backup.confirmDelete')}</button
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
