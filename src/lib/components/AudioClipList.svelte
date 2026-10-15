<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { formatClock } from '#lib/client/recording/recorder.ts';
  import { splitClipName } from '#lib/client/recording/clips.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';

  /** Voice clips as rows below the photo grid, in attachment order. */
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;
  let list = $state<HTMLUListElement>();
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  let playingId = $state<string | null>(null);
  let player: HTMLAudioElement | null = null;
  let nameInput = $state<HTMLInputElement>();
  let draft = $state('');
  let saving = $state(false);
  /** The name field belongs to a take just recorded (not the pencil button). */
  let wasNew = false;
  let viaPencil = false;
  const renamingId = $derived(workspace.renamingId);

  const all = $derived(workspace.active?.attachments ?? []);
  const clips = $derived(all.filter((a) => a.kind === 'audio'));
  const extension = $derived(
    splitClipName(clips.find((c) => c.id === renamingId)?.filename ?? '')
      .extension,
  );
  const hasPhotos = $derived(all.some((a) => a.kind !== 'audio'));
  const locked = $derived(
    workspace.busy || workspace.conflict || workspace.frozen,
  );

  // Opening the name field (a fresh take, or the pencil) fills in the current name.
  $effect(() => {
    const id = renamingId;
    if (!id) return;
    untrack(() => {
      const clip = clips.find((c) => c.id === id);
      if (!clip) return;
      draft = splitClipName(clip.filename).base;
      wasNew = !viaPencil;
      viaPencil = false;
      void tick().then(() => {
        nameInput?.focus();
        nameInput?.select();
        nameInput?.scrollIntoView?.({ block: 'nearest' });
      });
    });
  });
  /** Apply the typed name (an unusable one keeps the current name) and close the field. */
  async function commit(refocus = false) {
    const id = workspace.renamingId;
    if (!id || saving) return;
    if (clips.find((c) => c.id === id)?.source === 'server') {
      // A saved clip is renamed on the server: wait, and keep the field open on failure.
      saving = true;
      const ok = await workspace.renameSavedClip(id, draft);
      saving = false;
      if (!ok && workspace.renamingId === id) {
        nameInput?.focus();
        return;
      }
    } else workspace.renameClip(id, draft);
    if (workspace.renamingId === id) workspace.renamingId = null;
    if (refocus) restoreFocus(id);
  }
  /** Leaving the field applies an unsaved clip's name; a saved clip needs Enter/Save. */
  function leave() {
    const id = workspace.renamingId;
    if (!id || saving) return;
    if (clips.find((c) => c.id === id)?.source === 'server')
      workspace.renamingId = null;
    else void commit();
  }
  function cancelRename() {
    const id = workspace.renamingId;
    workspace.renamingId = null;
    if (id) restoreFocus(id);
  }
  /** Back to where the user was: the microphone button after a new take, else the clip. */
  function restoreFocus(id: string) {
    const container = list?.closest('.editor-container');
    void tick().then(() => {
      const mic = container?.querySelector<HTMLElement>('[data-record-button]');
      (wasNew ? mic : null)?.focus();
      if (!(wasNew && mic))
        list?.querySelector<HTMLElement>(`[data-clip="${id}"] .play`)?.focus();
      wasNew = false;
    });
  }
  function nameKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit(true);
    } else if (event.key === 'Escape') {
      // Escape must not also close a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      cancelRename();
    }
  }

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
          draggable={!locked && renamingId !== clip.id}
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
          {#if renamingId === clip.id}
            <input
              class="name-input"
              type="text"
              maxlength="200"
              autocomplete="off"
              spellcheck="false"
              aria-label={t('rec.name')}
              placeholder={t('rec.nameHint')}
              bind:this={nameInput}
              bind:value={draft}
              onkeydown={nameKey}
              onblur={leave}
              readonly={saving}
              data-testid="clip-name-input"
            />
            <span class="ext" aria-hidden="true">{extension}</span>
            <button
              type="button"
              class="save"
              aria-label={t('rec.nameSave')}
              title={t('rec.nameSave')}
              disabled={saving}
              onmousedown={(event) => event.preventDefault()}
              onclick={() => void commit(true)}
              ><svg viewBox="0 0 24 24" aria-hidden="true"
                ><path d="m5 12 5 5 9-10" /></svg
              ></button
            >
          {:else}
            <span class="name" title={clip.filename}>{clip.filename}</span>
            {#if clip.durationSeconds !== undefined}
              <span class="duration">{formatClock(clip.durationSeconds)}</span>
            {/if}
            {#if clip.silent}
              <span
                class="silent"
                role="img"
                aria-label={t('rec.silentClip')}
                title={t('rec.silentClip')}
                data-testid="clip-silent"
                ><svg viewBox="0 0 24 24" aria-hidden="true"
                  ><path d="M12 4 3 20h18zM12 10v4M12 17.5v.01" /></svg
                ></span
              >
            {/if}
            <button
              type="button"
              class="rename"
              aria-label={t('rec.rename', { name: clip.filename })}
              title={t('rec.renameTitle')}
              disabled={locked}
              onclick={() => {
                viaPencil = true;
                workspace.renamingId = clip.id;
              }}
              ><svg viewBox="0 0 24 24" aria-hidden="true"
                ><path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3" /></svg
              ></button
            >
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
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    min-height: 2.25rem;
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: 1.125rem;
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
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
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
  .play svg {
    fill: currentColor;
  }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 14rem;
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
  .remove,
  .rename {
    color: var(--muted);
  }
  .save {
    color: var(--accent);
  }
  .silent {
    display: inline-grid;
    color: var(--danger);
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
  .missing {
    margin: var(--space-1) 0 0;
    font-size: 0.875rem;
  }
</style>
