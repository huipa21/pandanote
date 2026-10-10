<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { manualLocation } from '#lib/shared/location.ts';
  import { locationSchema } from '#lib/shared/domain.ts';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
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
      error =
        'Current location requires a supported browser and HTTPS (or localhost). You can enter coordinates manually or post without location.';
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
            error =
              'The browser returned an invalid location. Enter coordinates manually or post without location.';
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
              ? 'Location permission was denied. Enter coordinates manually or post without location.'
              : failure.code === 3
                ? 'Location request timed out. Retry, enter coordinates manually, or post without location.'
                : 'Current location is unavailable. Retry, enter coordinates manually, or post without location.';
        },
        { maximumAge: 0, timeout: 10_000, enableHighAccuracy: false },
      );
    } catch {
      requesting = false;
      error =
        'The browser could not request location. Enter coordinates manually or post without location.';
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
      error = 'The active note changed. Close and reopen location.';
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
        failure instanceof Error
          ? failure.message
          : 'Check the location and retry.';
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
    >{workspace.active?.location ? 'Edit location' : 'Add location'}</button
  >{/if}
<Modal bind:open title="Note location" dismissible={!saving}>
  <p class="help">
    Optional, device-local until Post or Save changes. No tracking or map
    lookup. Browser accuracy is an estimate, not a guarantee.
  </p>
  <button
    type="button"
    disabled={locked || requesting || saving}
    onclick={current}
    >{requesting ? 'Requesting location…' : 'Use current location'}</button
  >
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <fieldset disabled={locked || saving}>
      <label for={`${id}-lat`}>Latitude</label><input
        id={`${id}-lat`}
        inputmode="decimal"
        bind:value={latitude}
        oninput={manualEdit}
        placeholder="−90 to 90"
        required
      />
      <label for={`${id}-lon`}>Longitude</label><input
        id={`${id}-lon`}
        inputmode="decimal"
        bind:value={longitude}
        oninput={manualEdit}
        placeholder="−180 to 180"
        required
      />
      <label for={`${id}-label`}>Location label (optional)</label><input
        id={`${id}-label`}
        bind:value={label}
        maxlength="200"
      />
      {#if accuracy !== null}<p>Reported accuracy: {accuracy} m</p>{:else}<p
          class="help"
        >
          Manual coordinates have no reported accuracy.
        </p>{/if}
      <div class="actions">
        <button class="primary" type="submit"
          >{saving ? 'Saving location…' : 'Save location'}</button
        >{#if workspace.active?.location}<button
            type="button"
            class="danger"
            onclick={() => save(true)}>Remove location</button
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
