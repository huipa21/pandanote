<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { formatClock } from '#lib/client/recording/recorder.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';

  /** Voice clips as rows below the photo grid, in attachment order. */
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;
  let list = $state<HTMLUListElement>();
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  let playingId = $state<string | null>(null);
  let player: HTMLAudioElement | null = null;

  const all = $derived(workspace.active?.attachments ?? []);
  const clips = $derived(all.filter((a) => a.kind === 'audio'));
  const hasPhotos = $derived(all.some((a) => a.kind !== 'audio'));
  const locked = $derived(
    workspace.busy || workspace.conflict || workspace.frozen,
  );

  function stopPlayback() {
    player?.pause();
    playingId = null;
  }
  async function toggle(id: string) {
    if (playingId === id) return stopPlayback();
    const url = workspace.clipUrls[id];
    if (!url) return;
    stopPlayback();
    player ??= new Audio();
    player.onended = () => (playingId = null);
    player.onerror = () => (playingId = null);
    player.src = url;
    playingId = id;
    try {
      await player.play();
    } catch {
      if (playingId === id) playingId = null;
    }
  }
  // A removed clip, or a take starting (the microphone would hear it), stops playback.
  $effect(() => {
    if (playingId && !clips.some((c) => c.id === playingId)) stopPlayback();
  });
  $effect(() => {
    if (workspace.recording) stopPlayback();
  });
  onDestroy(() => {
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
      player = null;
    }
  });

  function start(event: DragEvent, id: string) {
    if (locked || !event.dataTransfer) return event.preventDefault();
    dragId = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
  function over(event: DragEvent, id: string) {
    if (!dragId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    overId = id;
  }
  function drop(event: DragEvent, id: string) {
    if (!dragId) return;
    event.preventDefault();
    const target = all.findIndex((item) => item.id === id);
    const moving = dragId;
    end();
    if (target >= 0) void workspace.moveAttachment(moving, target);
  }
  function end() {
    dragId = null;
    overId = null;
  }
  async function key(event: KeyboardEvent, id: string, index: number) {
    if (!event.altKey || locked) return;
    const delta =
      event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? 1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const neighbor = clips[index + delta];
    if (!neighbor) return;
    // Moves are expressed against the full attachment order (photos included).
    await workspace.moveAttachment(
      id,
      all.findIndex((item) => item.id === neighbor.id),
    );
    await tick();
    list?.querySelector<HTMLElement>(`[data-clip="${id}"] .play`)?.focus();
  }
</script>

{#if clips.length}
  <div class="clips" data-testid="clip-list">
    <ul bind:this={list} aria-label={t('rec.clips', { count: clips.length })}>
      {#each clips as clip, index (clip.id)}
        <li
          data-clip={clip.id}
          class:dragging={dragId === clip.id}
          class:target={overId === clip.id && dragId !== clip.id}
          draggable={!locked}
          ondragstart={(event) => start(event, clip.id)}
          ondragover={(event) => over(event, clip.id)}
          ondrop={(event) => drop(event, clip.id)}
          ondragend={end}
        >
          <button
            type="button"
            class="play"
            aria-label={`${
              playingId === clip.id
                ? t('rec.pausePlay', { name: clip.filename })
                : t('rec.play', { name: clip.filename })
            }. ${t('rec.clip', { index: index + 1, total: clips.length })}`}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            disabled={!workspace.clipUrls[clip.id]}
            onclick={() => toggle(clip.id)}
            onkeydown={(event) => key(event, clip.id, index)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#if playingId === clip.id}<path d="M8 5v14M16 5v14" />
              {:else}<path d="M8 5v14l11-7z" />{/if}
            </svg>
          </button>
          <span class="name" title={clip.filename}>{clip.filename}</span>
          {#if clip.durationSeconds !== undefined}
            <span class="duration">{formatClock(clip.durationSeconds)}</span>
          {/if}
          <button
            type="button"
            class="remove"
            aria-label={t('attach.remove', { name: clip.filename })}
            title={t('attach.removeTitle')}
            disabled={locked}
            onclick={() => workspace.removeAttachment(clip.id)}
            ><svg viewBox="0 0 24 24" aria-hidden="true"
              ><path d="m7 7 10 10M17 7 7 17" /></svg
            ></button
          >
        </li>
      {/each}
    </ul>
    {#if !hasPhotos && workspace.missing.length}
      <p class="missing" role="alert">{t('attach.missing')}</p>
    {/if}
  </div>
{/if}

<style>
  .clips {
    flex: none;
    padding: var(--space-1) var(--space-3);
  }
  ul {
    display: grid;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target);
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) / 2);
    background: var(--accent-soft);
    cursor: grab;
  }
  li.dragging {
    opacity: 0.4;
  }
  li.target {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  button {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--target);
    height: var(--target);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .play svg {
    fill: currentColor;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .duration {
    flex: none;
    color: var(--muted);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  .remove {
    color: var(--muted);
  }
  .missing {
    margin: var(--space-1) 0 0;
    font-size: 0.875rem;
  }
</style>
