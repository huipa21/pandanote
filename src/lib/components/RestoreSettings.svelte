<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import type { RestoreSummary } from '#lib/shared/restores.ts';
  import { BACKUP_MAX_BYTES } from '#lib/shared/backups.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
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
  const i18n = useI18n();
  const t = i18n.t;
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
      throw new Error(
        result.error ? i18n.error(result.error) : t('restore.requestFailed'),
      );
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
      error = e instanceof Error ? e.message : t('restore.securityFailed');
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
        progress = t('restore.progressUpload', {
          loaded: event.loaded.toLocaleString(i18n.locale),
          total: archive.size.toLocaleString(i18n.locale),
        });
      };
      xhr.upload.onload = () => {
        progress = t('restore.progressValidate');
      };
      xhr.onload = () => {
        transfer = undefined;
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 400 || !result.ok)
            throw new Error(
              result.error
                ? i18n.error(result.error)
                : t('restore.invalidArchive'),
            );
          resolve(result.data);
        } catch (e) {
          reject(e);
        }
      };
      const failed = () => {
        transfer = undefined;
        reject(new Error(t('restore.interrupted')));
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
          throw new Error(t('restore.pickFile'));
        summary = await upload(fresh.grant, file);
        progress = t('restore.validated');
        open = false;
      } else {
        if (!summary) throw new Error(t('restore.uploadFirst'));
        progress = t('restore.replacing');
        await json('/api/restores/confirm', {
          id: summary.id,
          grant: fresh.grant,
          confirmed: true,
        });
        // Full navigation drops old private state.
        window.location.assign('/login');
      }
    } catch (e) {
      error =
        (e instanceof Error ? e.message : t('restore.requestFailed')) +
        (action === 'replace' ? t('restore.connectionSuffix') : '');
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
      progress = t('restore.discarded');
    } catch (e) {
      error = e instanceof Error ? e.message : t('restore.discardFailed');
    } finally {
      busy = false;
    }
  }
</script>

<div data-testid="restore-settings">
  <h3>{t('restore.heading')}</h3>
  <p>
    {t('restore.help')}
  </p>
  <p class="help">
    {t('restore.help2')}
  </p>
  <label for="restore-archive">{t('restore.archiveLabel')}</label>
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
      >{t('restore.upload')}</button
    >
    {#if summary}<button
        class="danger"
        disabled={busy}
        onclick={() => choose('replace')}>{t('restore.replace')}</button
      >
      <button disabled={busy} onclick={discard}>{t('restore.discard')}</button
      >{/if}
  </div>
  {#if progress}<p role="status">{progress}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if summary}
    <div class="summary" data-testid="restore-summary">
      <h4>{t('restore.summaryTitle')}</h4>
      <p>
        {t('restore.captured', {
          date: new Date(summary.createdAt).toLocaleString(i18n.locale),
          schema: summary.schemaVersion,
          bytes: summary.bytes.toLocaleString(i18n.locale),
        })}
      </p>
      <p>
        {t('restore.counts', {
          notes: summary.notes,
          published: summary.published,
          trash: summary.trash,
          attachments: summary.attachments,
        })}
      </p>
      <p>
        {t('restore.mfa', {
          state: summary.mfaEnabled
            ? t('security.enabled')
            : t('security.disabled'),
        })}
      </p>
    </div>
  {/if}
</div>
<Modal
  bind:open
  title={action === 'upload'
    ? t('restore.authUploadTitle')
    : t('restore.authReplaceTitle')}
  dismissible={!busy}
  onDismiss={() => {
    password = '';
    code = '';
  }}
>
  <p>
    {action === 'upload'
      ? t('restore.authUploadHelp')
      : t('restore.authReplaceHelp')}
  </p>
  <form onsubmit={submit}>
    <fieldset disabled={busy}>
      {#if action === 'replace'}<label class="confirmation"
          ><input type="checkbox" required bind:checked={confirmed} />
          {t('restore.understand')}</label
        >{/if}
      <label for="restore-password">{t('restore.password')}</label>
      <input
        id="restore-password"
        type="password"
        autocomplete="current-password"
        required
        bind:value={password}
      />
      {#if mfa}<label for="restore-code">{t('restore.code')}</label><input
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
          ? t('restore.working')
          : action === 'upload'
            ? t('restore.confirmUpload')
            : t('restore.confirmReplace')}</button
      >
    </fieldset>
    {#if busy}<p role="status">{progress || t('restore.authorizing')}</p>{/if}
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
