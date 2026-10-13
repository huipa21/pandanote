<script lang="ts">
  import { getContext, untrack, onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { ReadyAttachment } from '#lib/shared/attachments.ts';
  import {
    READING,
    type ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  let {
    images,
    selected,
    onClose,
  }: { images: ReadyAttachment[]; selected: string; onClose: () => void } =
    $props();
  const reading = getContext<ReadingState | undefined>(READING);
  const i18n = useI18n();
  const t = i18n.t;
  let open = $state(true);
  let index = $state(
    untrack(() =>
      Math.max(
        0,
        images.findIndex((image) => image.id === selected),
      ),
    ),
  );
  let zoom = $state(1);
  let x = $state(0);
  let y = $state(0);
  let failed = $state(false);
  let loading = $state(true);
  let retry = $state(0);
  let viewport: HTMLDivElement;
  let start: {
    id: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null = null;
  const image = $derived(images[index]);
  $effect(() => {
    if (reading) reading.viewer = true;
    return () => {
      if (reading) reading.viewer = false;
    };
  });
  onMount(() => {
    const observer = new ResizeObserver(clamp);
    observer.observe(viewport);
    return () => observer.disconnect();
  });
  function reset() {
    zoom = 1;
    x = 0;
    y = 0;
  }
  function move(direction: number) {
    const next = index + direction;
    if (next < 0 || next >= images.length) return;
    index = next;
    reset();
    failed = false;
    loading = true;
    retry = 0;
  }
  function clamp() {
    const maxX = (viewport.clientWidth * (zoom - 1)) / 2;
    const maxY = (viewport.clientHeight * (zoom - 1)) / 2;
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  }
  function magnify(change: number) {
    zoom = Math.max(1, Math.min(5, zoom + change));
    clamp();
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || start) return;
    start = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: x,
      panY: y,
    };
    viewport.setPointerCapture(event.pointerId);
  }
  function pan(event: PointerEvent) {
    if (!start || event.pointerId !== start.id || zoom === 1) return;
    x = start.panX + event.clientX - start.x;
    y = start.panY + event.clientY - start.y;
    clamp();
  }
  function up(event: PointerEvent) {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (zoom === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
      move(dx < 0 ? 1 : -1);
    start = null;
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      magnify(0.5);
    } else if (event.key === '-') {
      event.preventDefault();
      magnify(-0.5);
    } else if (event.key === '0') {
      event.preventDefault();
      reset();
    }
  }
</script>

<Modal
  bind:open
  title={t('viewer.title')}
  kind="viewer"
  onDismiss={onClose}
  onKey={keyboard}
>
  <div class="viewer-content">
    <div class="toolbar">
      <button
        aria-label={t('viewer.prevImage')}
        disabled={index === 0}
        onclick={() => move(-1)}>{t('viewer.prev')}</button
      >
      <span role="status"
        >{t('viewer.status', {
          index: index + 1,
          total: images.length,
          zoom: Math.round(zoom * 100),
        })}</span
      >
      <button
        aria-label={t('viewer.nextImage')}
        disabled={index === images.length - 1}
        onclick={() => move(1)}>{t('viewer.next')}</button
      >
      <button
        aria-label={t('viewer.zoomOut')}
        disabled={zoom === 1}
        onclick={() => magnify(-0.5)}>−</button
      >
      <button
        aria-label={t('viewer.zoomIn')}
        disabled={zoom === 5}
        onclick={() => magnify(0.5)}>+</button
      >
      <button onclick={reset}>{t('viewer.resetZoom')}</button>
      <a href={`/api/attachments/${image.id}/display?download=1`} download
        >{t('viewer.downloadWebp')}</a
      >
    </div>
    <p class="help">
      {t('viewer.help', { name: image.filename })}
    </p>
    {#if loading}<p class="help" role="status">{t('viewer.loading')}</p>{/if}
    {#if failed}<p role="alert">
        {t('viewer.failed')}
        <button
          onclick={() => {
            retry++;
            failed = false;
            loading = true;
          }}>{t('viewer.retryImage')}</button
        >
      </p>{/if}
    <!-- Gestures are confined to the viewer; accessible toolbar supplies every action. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="viewport"
      bind:this={viewport}
      onpointerdown={down}
      onpointermove={pan}
      onpointerup={up}
      onpointercancel={() => {
        start = null;
      }}
    >
      {#key image.id + ':' + retry}
        <img
          src={`/api/attachments/${image.id}/display${retry ? `?retry=${retry}` : ''}`}
          alt={image.filename}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          draggable="false"
          style:transform={`translate(${x}px, ${y}px) scale(${zoom})`}
          onload={() => {
            loading = false;
          }}
          onerror={() => {
            loading = false;
            failed = true;
          }}
        />
      {/key}
    </div>
  </div>
</Modal>

<style>
  .viewer-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }
  .toolbar a {
    min-height: var(--target);
    display: inline-flex;
    align-items: center;
  }
  .help {
    margin-block: var(--space-1);
    overflow-wrap: anywhere;
  }
  .viewport {
    flex: 1;
    min-height: 4rem;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: grab;
  }
  img:active {
    cursor: grabbing;
  }
</style>
