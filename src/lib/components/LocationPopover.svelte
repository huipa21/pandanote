<script lang="ts">
  import { onMount } from 'svelte';
  import type { NoteLocation } from '#lib/shared/domain.ts';
  import { locationCoordinates, locationMapUrl } from '#lib/shared/location.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let { location }: { location: NoteLocation } = $props();
  const id = $props.id();
  const t = useI18n().t;
  let message = $state('');
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(locationCoordinates(location));
      message = t('location.copied');
    } catch {
      message = t('location.copyFailed');
    }
  }
</script>

<button
  type="button"
  class="location-chip"
  popovertarget={id}
  onclick={() => {
    message = '';
  }}
  >{t('location.chip', {
    label: location.label || locationCoordinates(location),
  })}</button
>
<div
  {id}
  popover="auto"
  role="dialog"
  tabindex="-1"
  aria-label={t('location.details')}
  class="location-popover"
  onkeydown={(event) => {
    if (event.key === 'Escape') event.stopPropagation();
  }}
>
  {#if location.label}<p><strong>{location.label}</strong></p>{/if}
  <p class="coordinates">{locationCoordinates(location)}</p>
  {#if location.accuracy !== null}<p>
      {t('location.accuracy', { accuracy: location.accuracy })}
    </p>{/if}
  <div class="actions">
    <button type="button" disabled={!ready} onclick={copy}
      >{t('location.copy')}</button
    ><a
      href={locationMapUrl(location)}
      target="_blank"
      rel="external noopener noreferrer">{t('location.openMap')}</a
    ><button type="button" popovertarget={id} popovertargetaction="hide"
      >{t('location.close')}</button
    >
  </div>
  <p class="help">
    {t('location.mapNote')}
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
