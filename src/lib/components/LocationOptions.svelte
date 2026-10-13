<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { manualLocation } from '#lib/shared/location.ts';
  import { locationSchema } from '#lib/shared/domain.ts';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let {
    workspace,
    open = $bindable(false),
    showTrigger = true,
  }: {
    workspace: EditorWorkspace;
    open?: boolean;
    showTrigger?: boolean;
  } = $props();
  let latitude = $state('');
  let longitude = $state('');
  let label = $state('');
  let accuracy = $state<number | null>(null);
  let requesting = $state(false);
  let saving = $state(false);
  let error = $state('');
  let generation = 0;
  let sessionId: string | null = null;
  const id = $props.id();
  const t = useI18n().t;
  let locked = $derived(
    !workspace.ready ||
      workspace.busy ||
      workspace.frozen ||
      workspace.conflict ||
      workspace.posting,
  );
  $effect(() => {
    if (!open) {
      generation++;
      requesting = false;
    } else
      untrack(() => {
        const location = workspace.active?.location;
        sessionId = workspace.active?.localId ?? null;
        latitude = location ? String(location.latitude) : '';
        longitude = location ? String(location.longitude) : '';
        label = location?.label ?? '';
        accuracy = location?.accuracy ?? null;
        error = '';
      });
  });
  function current() {
    if (requesting || locked) return;
    error = '';
    if (!window.isSecureContext || !navigator.geolocation) {
      error = t('location.unsupported');
      return;
    }
    requesting = true;
    const request = ++generation;
    // Permission is requested only here, never on mount/open/preview/Post.
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (
            !open ||
            request !== generation ||
            sessionId !== (workspace.active?.localId ?? null)
          )
            return;
          requesting = false;
          const result = locationSchema.safeParse({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            label: label.trim() || null,
          });
          if (!result.success) {
            error = t('location.invalidBrowser');
            return;
          }
          latitude = String(result.data.latitude);
          longitude = String(result.data.longitude);
          accuracy = result.data.accuracy;
        },
        (failure) => {
          if (!open || request !== generation) return;
          requesting = false;
          error =
            failure.code === 1
              ? t('location.denied')
              : failure.code === 3
                ? t('location.timeout')
                : t('location.unavailable');
        },
        { maximumAge: 0, timeout: 10_000, enableHighAccuracy: false },
      );
    } catch {
      requesting = false;
      error = t('location.cannotRequest');
    }
  }
  function manualEdit() {
    accuracy = null;
    generation++;
    requesting = false;
  }
  async function save(remove = false) {
    if (locked || saving) return;
    if (sessionId !== (workspace.active?.localId ?? null)) {
      error = t('location.activeChanged');
      return;
    }
    error = '';
    try {
      const location = remove
        ? null
        : manualLocation(latitude, longitude, label, accuracy);
      saving = true;
      generation++;
      requesting = false;
      workspace.updateMetadata({
        timelineAt: workspace.active?.timelineAt ?? Date.now(),
        location,
      });
      open = false;
    } catch (failure) {
      error =
        failure instanceof Error ? failure.message : t('location.checkRetry');
    } finally {
      saving = false;
    }
  }
</script>

{#if showTrigger}<button
    class="location-trigger"
    type="button"
    disabled={locked}
    onclick={() => {
      open = true;
    }}
    title={workspace.active?.location?.label ?? undefined}
    >{workspace.active?.location
      ? t('editor.editLocation')
      : t('editor.addLocation')}</button
  >{/if}
<Modal bind:open title={t('location.title')} dismissible={!saving}>
  <p class="help">
    {t('location.help')}
  </p>
  <button
    type="button"
    disabled={locked || requesting || saving}
    onclick={current}
    >{requesting ? t('location.requesting') : t('location.useCurrent')}</button
  >
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <fieldset disabled={locked || saving}>
      <label for={`${id}-lat`}>{t('location.latitude')}</label><input
        id={`${id}-lat`}
        inputmode="decimal"
        bind:value={latitude}
        oninput={manualEdit}
        placeholder={t('location.latPlaceholder')}
        required
      />
      <label for={`${id}-lon`}>{t('location.longitude')}</label><input
        id={`${id}-lon`}
        inputmode="decimal"
        bind:value={longitude}
        oninput={manualEdit}
        placeholder={t('location.lonPlaceholder')}
        required
      />
      <label for={`${id}-label`}>{t('location.labelField')}</label><input
        id={`${id}-label`}
        bind:value={label}
        maxlength="200"
      />
      {#if accuracy !== null}<p>
          {t('location.accuracyReported', { accuracy })}
        </p>{:else}<p class="help">
          {t('location.noAccuracy')}
        </p>{/if}
      <div class="actions">
        <button class="primary" type="submit"
          >{saving ? t('location.saving') : t('location.save')}</button
        >{#if workspace.active?.location}<button
            type="button"
            class="danger"
            onclick={() => save(true)}>{t('location.remove')}</button
          >{/if}
      </div>
    </fieldset>
  </form>
  {#if error}<p role="alert">{error}</p>{/if}
</Modal>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: var(--space-3) 0 0;
    min-width: 0;
    display: grid;
    gap: var(--space-2);
  }
  input {
    width: 100%;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .location-trigger {
    white-space: nowrap;
  }
  @media (max-width: 899px) and (max-height: 400px) {
    .location-trigger {
      font-size: 0.75rem;
      padding-inline: 4px;
    }
    button {
      min-height: 2rem;
      padding-block: 0;
    }
  }
</style>
