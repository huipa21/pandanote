<script module lang="ts">
  /** The one clip allowed to play across every card and the note page. */
  let current: HTMLAudioElement | null = null;
</script>

<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    renamedClipFilename,
    splitClipName,
  } from '#lib/client/recording/clips.ts';
  import {
    renameSavedClip,
    savedClipNames,
  } from '#lib/client/recording/saved-names.svelte.ts';

  /**
   * A stored voice clip shown as a compact chip: a small play/pause icon and the name.
   * The audio element has no native controls and nothing is fetched until the user
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
  let playing = $state(false);
  // A rename in this page session wins over the (older) snapshot the card holds.
  const name = $derived(savedClipNames.get(id) ?? filename);
  let renaming = $state(false);
  let saving = $state(false);
  let draft = $state('');
  let problem = $state('');
  let input = $state<HTMLInputElement>();
  let pencil = $state<HTMLButtonElement>();
  const extension = $derived(splitClipName(name).extension);

  async function openRename() {
    draft = splitClipName(name).base;
    problem = '';
    renaming = true;
    await tick();
    input?.focus();
    input?.select();
  }
  async function closeRename() {
    renaming = false;
    problem = '';
    await tick();
    pencil?.focus();
  }
  async function save() {
    if (saving) return;
    const next = renamedClipFilename(name, draft);
    if (!next || next === name) return void closeRename();
    saving = true;
    const result = await renameSavedClip(id, next);
    saving = false;
    if (result.ok) await closeRename();
    else {
      problem = result.message;
      input?.focus();
    }
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void closeRename();
    }
  }

  function toggle() {
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => (playing = false));
    else audio.pause();
  }
  function played() {
    if (current && current !== audio) current.pause();
    current = audio ?? null;
    playing = true;
  }
  function stopped() {
    if (current === audio) current = null;
    playing = false;
  }
  $effect(() => {
    if (suspended) audio?.pause();
  });
  onDestroy(() => {
    if (audio && current === audio) current = null;
    audio?.pause();
  });
</script>

<li class="clip" class:playing data-testid="voice-clip" data-clip={id}>
  <button
    type="button"
    class="play"
    aria-label={playing
      ? t('rec.pausePlay', { name })
      : t('rec.play', { name })}
    aria-pressed={playing}
    onclick={toggle}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if playing}<path d="M8 5v14M16 5v14" />{:else}<path
          d="M8 5v14l11-7z"
        />{/if}
    </svg>
  </button>
  {#if renaming}
    <input
      class="name-input"
      type="text"
      maxlength="200"
      autocomplete="off"
      spellcheck="false"
      aria-label={t('rec.name')}
      bind:this={input}
      bind:value={draft}
      readonly={saving}
      onkeydown={key}
      onblur={() => {
        if (!saving) renaming = false;
      }}
      data-testid="clip-name-input"
    />
    <span class="ext" aria-hidden="true">{extension}</span>
    <button
      type="button"
      class="icon save"
      aria-label={t('rec.nameSave')}
      title={t('rec.nameSave')}
      disabled={saving}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => void save()}
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="m5 12 5 5 9-10" /></svg
      ></button
    >
    {#if problem}<span class="problem" role="alert">{problem}</span>{/if}
  {:else}
    <span class="name" title={name}>{name}</span>
    <button
      type="button"
      class="icon rename"
      bind:this={pencil}
      aria-label={t('rec.rename', { name })}
      title={t('rec.renameTitle')}
      onclick={() => void openRename()}
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3" /></svg
      ></button
    >
  {/if}
  <audio
    bind:this={audio}
    preload="none"
    src={`/api/attachments/${id}/file`}
    onplay={played}
    onpause={stopped}
    onended={stopped}
    onerror={stopped}
  ></audio>
  <a
    class="download"
    href={`/api/attachments/${id}/file?download=1`}
    download={name}
    aria-label={t('note.downloadClip', { name })}
    title={t('note.downloadClip', { name })}
    ><svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg
    ></a
  >
</li>

<style>
  .clip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    min-height: 2.25rem;
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: 1.125rem;
    background: var(--accent-soft);
  }
  .clip.playing {
    border-color: var(--accent);
  }
  .play,
  .icon,
  .download {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
  }
  .play {
    color: var(--accent);
  }
  .play svg {
    fill: currentColor;
  }
  .clip.playing .play svg {
    fill: none;
  }
  .name {
    min-width: 0;
    max-width: 16rem;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .download,
  .rename {
    color: var(--muted);
  }
  .save {
    color: var(--accent);
  }
  .clip:has(.name-input) {
    flex-wrap: wrap;
  }
  .name-input {
    flex: 1 1 8rem;
    min-width: 6rem;
    width: 12rem;
    max-width: 100%;
    height: 1.75rem;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--control-border);
    border-radius: calc(var(--radius) / 2);
  }
  .ext {
    flex: none;
    color: var(--muted);
    font-size: 0.875rem;
  }
  .problem {
    flex: 1 1 100%;
    padding: 0 var(--space-2) var(--space-1);
    font-size: 0.875rem;
    color: var(--danger);
  }
  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
