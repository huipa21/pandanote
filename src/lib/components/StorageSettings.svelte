<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import Modal from './Modal.svelte';
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
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(bytes / scale)} ${unit}`;
  }
  function date(value: number) {
    return new Intl.DateTimeFormat(undefined, {
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
        payload.error?.message ?? 'Storage request failed. Retry.',
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
          : 'Could not reach the server to measure storage. Retry refreshing storage.';
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
      error =
        'Check the limits. Values must be within the shown bounds and represent whole bytes/pixels.';
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
      message =
        'Storage limits saved. They apply to new uploads and saves; existing files are not reprocessed.';
    } catch (failure) {
      error =
        failure instanceof Error &&
        failure.name !== 'TypeError' &&
        failure.name !== 'TimeoutError'
          ? failure.message
          : 'Could not save storage limits. Your choices remain here; retry.';
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
        ? 'Some byte deletion is still queued. Refresh storage and retry queued cleanup; operator inspection may be needed.'
        : selected
          ? 'Unused attempt cleaned. Referenced note files were not removed.'
          : 'Queued cleanup finished. Referenced note files were not removed.';
      await refresh();
    } catch (failure) {
      error =
        failure instanceof Error &&
        failure.name !== 'TypeError' &&
        failure.name !== 'TimeoutError'
          ? failure.message
          : 'Cleanup was not confirmed. Refresh storage before retrying; the server may have queued deletion.';
    } finally {
      cleaning = false;
    }
  }
</script>

<section class="surface">
  <h2>Storage</h2>
  <p class="help">
    Private server storage, including Trash. Unsaved editors are not included or
    backed up. The disk is shared with the OS and other applications; free space
    is not all available for uploads.
  </p>
  <button disabled={!ready || loading || cleaning} onclick={refresh}
    >{loading ? 'Measuring storage…' : 'Refresh storage'}</button
  >
  {#if usageError}<p role="alert">{usageError}</p>{/if}
  {#if usage}
    <p class="help">
      Measured {date(usage.measuredAt)} ({timezone}). Refresh for current usage.
    </p>
    <dl>
      <dt>Media (attachments, Trash & unused uploads)</dt>
      <dd>
        {size(usage.referencedBytes + usage.trashOnlyBytes + usage.unusedBytes)}
      </dd>
      <dt>SQL database & journals</dt>
      <dd>{size(usage.databaseBytes)}</dd>
    </dl>
    <p class="help">
      Media uses recorded processed bytes; shared files count once. Database
      size is measured on disk.
    </p>
    {#if usage.cleanupJobs}<p role="status">
        {usage.cleanupJobs} file deletion jobs remain queued. Retry queued cleanup
        or restart the server; operator inspection may be needed.
      </p>
      <button
        class="danger"
        disabled={cleaning || loading}
        onclick={() => {
          selected = null;
          confirm = true;
          error = '';
        }}>Retry queued cleanup</button
      >{/if}
    <h3>Unused posting attempts</h3>
    <p class="help">
      {usage.pendingBatchCount} pending attempts. Showing up to 20, oldest activity
      first. Nothing expires automatically. Only attempts quiet for at least 24 hours
      can be cleaned. Resuming or uploading renews that protection. Cleanup abandons
      an entire frozen attempt, not just one of its files.
    </p>
    {#if !usage.pendingUploads.length}<p>No unused pending attempts.</p>{/if}
    <ul class="attempts">
      {#each usage.pendingUploads as attempt (attempt.id)}<li>
          <p>
            {attempt.readyCount} ready / {attempt.itemCount} files · {size(
              attempt.storedBytes,
            )} · last activity {date(attempt.activityAt)}
          </p>
          <p class="help">
            {attempt.filenames.join(', ') ||
              'No selected files'}{attempt.itemCount > 5 ? ' …' : ''}
          </p>
          {#if !attempt.eligible}<p class="help">
              Protected until {date(attempt.eligibleAt)}. Refresh then; no
              automatic deletion.
            </p>{/if}
          <button
            class="danger"
            disabled={!attempt.eligible || cleaning || loading}
            onclick={() => {
              selected = attempt;
              confirm = true;
              error = '';
            }}>Clean unused attempt</button
          >
        </li>{/each}
    </ul>
  {:else if !loading && !usageError}<p>Storage has not been measured.</p>{/if}
  <h3>Upload, image & note limits</h3>
  <p class="help">
    Static images only; originals are not retained after posting. Images are
    oriented, metadata stripped, resized without upscaling, and stored as
    display/thumbnail WebP. Quality is 1–100. Lower limits do not delete
    existing data, but can block uncommitted saves. MiB = 1,048,576 bytes; KiB =
    1,024 bytes.
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
        >{saving ? 'Saving limits…' : 'Save storage limits'}</button
      >
    </fieldset>
  </form>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error && !confirm}<p role="alert">{error}</p>{/if}
</section>
<Modal bind:open={confirm} title="Clean unused uploads" dismissible={!cleaning}>
  {#if selected}<p>
      Abandon this posting attempt and remove its {selected.readyCount} ready files
      ({size(selected.storedBytes)}) plus unfinished metadata?
    </p>{:else}<p>
      Retry byte deletion that was already confirmed and queued? References are
      checked again before removal.
    </p>{/if}
  <p>
    Referenced note and Trash files are never selected. The server rechecks
    references. This cannot be undone.
  </p>
  {#if selected}<p>
      A frozen retry for this batch will no longer work. Keep original files and
      start a new editable attempt before posting again.
    </p>{:else}<p>
      Only already-queued files are considered; no additional posting attempts
      are abandoned.
    </p>{/if}
  <button class="danger" disabled={cleaning} onclick={cleanup}
    >{cleaning ? 'Cleaning…' : 'Confirm cleanup'}</button
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
