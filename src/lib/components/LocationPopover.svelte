<script lang="ts">
  import { onMount } from 'svelte';
  import type { NoteLocation } from '#lib/shared/domain.ts';
  import { locationCoordinates, locationMapUrl } from '#lib/shared/location.ts';
  let { location }: { location: NoteLocation } = $props();
  const id = $props.id();
  let message = $state('');
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(locationCoordinates(location));
      message = 'Coordinates copied.';
    } catch {
      message =
        'Could not copy. Select the shown coordinates to copy manually.';
    }
  }
</script>

<button
  type="button"
  class="location-chip"
  popovertarget={id}
  onclick={() => {
    message = '';
  }}>Location: {location.label || locationCoordinates(location)}</button
>
<div
  {id}
  popover="auto"
  role="dialog"
  tabindex="-1"
  aria-label="Location details"
  class="location-popover"
  onkeydown={(event) => {
    if (event.key === 'Escape') event.stopPropagation();
  }}
>
  {#if location.label}<p><strong>{location.label}</strong></p>{/if}
  <p class="coordinates">{locationCoordinates(location)}</p>
  {#if location.accuracy !== null}<p>
      Reported accuracy: {location.accuracy} m (estimate)
    </p>{/if}
  <div class="actions">
    <button type="button" disabled={!ready} onclick={copy}
      >Copy coordinates</button
    ><a
      href={locationMapUrl(location)}
      target="_blank"
      rel="external noopener noreferrer"
      data-sveltekit-reload>Open map</a
    ><button type="button" popovertarget={id} popovertargetaction="hide"
      >Close location</button
    >
  </div>
  <p class="help">
    Open map shares these coordinates with OpenStreetMap in a new tab. No map is
    loaded here.
  </p>
  {#if message}<p role="status">{message}</p>{/if}
</div>

<style>
  .location-chip {
    font-size: 0.875rem;
    margin-top: var(--space-2);
    max-width: 100%;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .location-popover {
    width: min(26rem, calc(100% - 2 * var(--outer-gap)));
    max-height: calc(100dvh - 2 * var(--outer-gap));
    overflow: auto;
    padding: var(--space-4);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .coordinates {
    user-select: text;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  a {
    min-height: var(--target);
    display: inline-flex;
    align-items: center;
  }
</style>
