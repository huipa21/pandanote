<script module lang="ts">
  /** The one clip allowed to play across every card and the note page. */
  let current: HTMLAudioElement | null = null;
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';

  /**
   * A stored voice clip: native controls, nothing is fetched until the user
   * plays (`preload="none"`). Starting one clip pauses any other. `suspended`
   * (the card is being edited / hidden) pauses this clip.
   */
  let {
    id,
    filename,
    suspended = false,
  }: { id: string; filename: string; suspended?: boolean } = $props();
  const t = useI18n().t;
  let audio = $state<HTMLAudioElement>();

  function played() {
    if (current && current !== audio) current.pause();
    current = audio ?? null;
  }
  function stopped() {
    if (current === audio) current = null;
  }
  $effect(() => {
    if (suspended) audio?.pause();
  });
  onDestroy(() => {
    if (audio && current === audio) current = null;
    audio?.pause();
  });
</script>

<li class="clip" data-testid="voice-clip" data-clip={id}>
  <span class="name" title={filename}>{filename}</span>
  <audio
    bind:this={audio}
    controls
    preload="none"
    src={`/api/attachments/${id}/file`}
    aria-label={filename}
    onplay={played}
    onpause={stopped}
    onended={stopped}
  ></audio>
  <a
    class="download"
    href={`/api/attachments/${id}/file?download=1`}
    download={filename}
    aria-label={t('note.downloadClip', { name: filename })}
    title={t('note.downloadClip', { name: filename })}
    ><svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg
    ></a
  >
</li>

<style>
  .clip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--space-2);
    row-gap: 0.125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) / 2);
    background: var(--accent-soft);
  }
  .name {
    grid-column: 1 / -1;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  audio {
    width: 100%;
    min-width: 0;
    height: 2.5rem;
  }
  .download {
    display: inline-grid;
    place-items: center;
    width: var(--target);
    height: var(--target);
    color: var(--muted);
  }
  .download svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
