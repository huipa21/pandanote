<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    STORAGE_FIELDS,
    storageLimitsSchema,
    storageUsageSchema,
    type StorageLimits,
    type StorageUsage,
    type PendingUpload,
  } from '#lib/shared/storage.ts';
  let { initial, timezone }: { initial: StorageLimits; timezone: string } =
    $props();
  let limits = $state(untrack(() => ({ ...initial })));
  let usage = $state<StorageUsage | null>(null);
  let ready = $state(false);
  let loading = $state(false);
  let saving = $state(false);
  let cleaning = $state(false);
  let selected = $state<PendingUpload | null>(null);
  let confirm = $state(false);
  let message = $state('');
  let error = $state('');
  let usageError = $state('');
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;
  function size(bytes: number) {
    const unit =
      bytes < 1024
        ? 'bytes'
        : bytes < 1024 ** 2
          ? 'KiB'
          : bytes < 1024 ** 3
            ? 'MiB'
            : 'GiB';
    const scale =
      unit === 'bytes'
        ? 1
        : unit === 'KiB'
          ? 1024
          : unit === 'MiB'
            ? 1024 ** 2
            : 1024 ** 3;
    return `${new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(bytes / scale)} ${unit}`;
  }
  function date(value: number) {
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(value);
  }
  async function request(
    url: string,
    options: NonNullable<Parameters<typeof fetch>[1]> = {},
  ) {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok)
      throw new Error(
        payload.error ? i18n.error(payload.error) : t('storage.requestFailed'),
      );
    return payload.data;
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    usageError = '';
    try {
      const data = await request('/api/settings/storage');
      usage = storageUsageSchema.parse(data.usage);
    } catch (failure) {
      usageError =
        failure instanceof Error &&
        failure.name !== 'TypeError' &&
        failure.name !== 'TimeoutError'
          ? failure.message
          : t('storage.measureFailed');
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    ready = true;
    void refresh();
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    error = '';
    message = '';
    const parsed = storageLimitsSchema.safeParse(limits);
    if (!parsed.success) {
      error = t('storage.checkLimits');
      return;
    }
    saving = true;
    try {
      limits = storageLimitsSchema.parse(
        await request('/api/settings/storage', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        }),
      );
      await invalidateAll();
      message = t('storage.limitsSaved');
    } catch (failure) {
      error =
        failure instanceof Error &&
        failure.name !== 'TypeError' &&
        failure.name !== 'TimeoutError'
          ? failure.message
          : t('storage.saveFailed');
    } finally {
      saving = false;
    }
  }
  async function cleanup() {
    if (cleaning) return;
    cleaning = true;
    error = '';
    message = '';
    try {
      const data = await request('/api/settings/storage/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          ...(selected
            ? {
                batches: [{ id: selected.id, activityAt: selected.activityAt }],
              }
            : { retryQueued: true }),
        }),
      });
      confirm = false;
      message = data.remainingJobs
        ? t('storage.cleanupQueued')
        : selected
          ? t('storage.cleanupAttempt')
          : t('storage.cleanupDone');
      await refresh();
    } catch (failure) {
      error =
        failure instanceof Error &&
        failure.name !== 'TypeError' &&
        failure.name !== 'TimeoutError'
          ? failure.message
          : t('storage.cleanupFailed');
    } finally {
      cleaning = false;
    }
  }
</script>

<section class="surface">
  <h2>{t('storage.heading')}</h2>
  <p class="help">
    {t('storage.help')}
  </p>
  <button disabled={!ready || loading || cleaning} onclick={refresh}
    >{loading ? t('storage.measuring') : t('storage.refresh')}</button
  >
  {#if usageError}<p role="alert">{usageError}</p>{/if}
  {#if usage}
    <p class="help">
      {t('storage.measured', { date: date(usage.measuredAt), timezone })}
    </p>
    <dl>
      <dt>{t('storage.mediaLabel')}</dt>
      <dd>
        {size(usage.referencedBytes + usage.trashOnlyBytes + usage.unusedBytes)}
      </dd>
      <dt>{t('storage.dbLabel')}</dt>
      <dd>{size(usage.databaseBytes)}</dd>
    </dl>
    <p class="help">
      {t('storage.mediaHelp')}
    </p>
    {#if usage.cleanupJobs}<p role="status">
        {t('storage.jobsQueued', { count: usage.cleanupJobs })}
      </p>
      <button
        class="danger"
        disabled={cleaning || loading}
        onclick={() => {
          selected = null;
          confirm = true;
          error = '';
        }}>{t('storage.retryCleanup')}</button
      >{/if}
    <h3>{t('storage.attemptsTitle')}</h3>
    <p class="help">
      {t('storage.attemptsHelp', { count: usage.pendingBatchCount })}
    </p>
    {#if !usage.pendingUploads.length}<p>{t('storage.noAttempts')}</p>{/if}
    <ul class="attempts">
      {#each usage.pendingUploads as attempt (attempt.id)}<li>
          <p>
            {t('storage.attemptLine', {
              ready: attempt.readyCount,
              files: attempt.itemCount,
              size: size(attempt.storedBytes),
              date: date(attempt.activityAt),
            })}
          </p>
          <p class="help">
            {attempt.filenames.join(', ') ||
              t('storage.noFiles')}{attempt.itemCount > 5 ? ' …' : ''}
          </p>
          {#if !attempt.eligible}<p class="help">
              {t('storage.protectedUntil', { date: date(attempt.eligibleAt) })}
            </p>{/if}
          <button
            class="danger"
            disabled={!attempt.eligible || cleaning || loading}
            onclick={() => {
              selected = attempt;
              confirm = true;
              error = '';
            }}>{t('storage.cleanAttempt')}</button
          >
        </li>{/each}
    </ul>
  {:else if !loading && !usageError}<p>{t('storage.notMeasured')}</p>{/if}
  <h3>{t('storage.limitsTitle')}</h3>
  <p class="help">
    {t('storage.limitsHelp')}
  </p>
  <form onsubmit={save}>
    <fieldset disabled={!ready || saving || cleaning}>
      {#each STORAGE_FIELDS as field (field.key)}<label
          for={`${id}-${field.key}`}
          >{field.label}
          <span class="help">({field.min}–{field.max})</span></label
        ><input
          id={`${id}-${field.key}`}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={limits[field.key] / field.scale}
          required
          oninput={(event) => {
            limits[field.key] = event.currentTarget.valueAsNumber * field.scale;
          }}
        />{/each}
      <button class="primary" type="submit"
        >{saving ? t('storage.saving') : t('storage.saveLimits')}</button
      >
    </fieldset>
  </form>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error && !confirm}<p role="alert">{error}</p>{/if}
</section>
<Modal
  bind:open={confirm}
  title={t('storage.cleanTitle')}
  dismissible={!cleaning}
>
  {#if selected}<p>
      {t('storage.cleanAttemptQ', {
        count: selected.readyCount,
        size: size(selected.storedBytes),
      })}
    </p>{:else}<p>
      {t('storage.cleanQueuedQ')}
    </p>{/if}
  <p>
    {t('storage.cleanNote')}
  </p>
  {#if selected}<p>
      {t('storage.cleanAttemptWarn')}
    </p>{:else}<p>
      {t('storage.cleanQueuedWarn')}
    </p>{/if}
  <button class="danger" disabled={cleaning} onclick={cleanup}
    >{cleaning ? t('storage.cleaning') : t('storage.confirmCleanup')}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
</Modal>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  input {
    width: min(100%, 22rem);
  }
  dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .attempts {
    padding: 0;
    list-style: none;
  }
  li {
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  label {
    overflow-wrap: anywhere;
  }
</style>
