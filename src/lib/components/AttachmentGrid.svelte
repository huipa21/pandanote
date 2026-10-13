<script lang="ts">
  import { tick } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';

  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;
  let list = $state<HTMLUListElement>();
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);

  const items = $derived(workspace.active?.attachments ?? []);
  const locked = $derived(
    workspace.busy || workspace.conflict || workspace.frozen,
  );

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
    const target = items.findIndex((item) => item.id === id);
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
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0;
    if (!delta) return;
    event.preventDefault();
    await workspace.moveAttachment(id, index + delta);
    await tick();
    list
      ?.querySelector<HTMLElement>(`[data-attachment="${id}"] .tile`)
      ?.focus();
  }
</script>

{#if items.length}
  <div class="attachments">
    <ul bind:this={list} aria-label={t('attach.list', { count: items.length })}>
      {#each items as item, index (item.id)}
        <li
          data-attachment={item.id}
          class:dragging={dragId === item.id}
          class:target={overId === item.id && dragId !== item.id}
          draggable={!locked}
          ondragstart={(event) => start(event, item.id)}
          ondragover={(event) => over(event, item.id)}
          ondrop={(event) => drop(event, item.id)}
          ondragend={end}
        >
          <button
            type="button"
            class="tile"
            aria-label={t('attach.tile', {
              name: item.filename,
              index: index + 1,
              total: items.length,
            })}
            onkeydown={(event) => key(event, item.id, index)}
          >
            {#if workspace.thumbs[item.id]}
              <img
                src={workspace.thumbs[item.id]}
                alt=""
                draggable="false"
                decoding="async"
              />
            {:else}
              <span class="placeholder">
                <span aria-hidden="true"
                  >{item.kind === 'image' ? '🖼' : '🎞'}</span
                >
                <span class="name">{item.filename}</span>
              </span>
            {/if}
          </button>
          <button
            type="button"
            class="remove"
            aria-label={t('attach.remove', { name: item.filename })}
            title={t('attach.removeTitle')}
            disabled={locked}
            onclick={() => workspace.removeAttachment(item.id)}
            ><svg viewBox="0 0 24 24" aria-hidden="true"
              ><path d="m7 7 10 10M17 7 7 17" /></svg
            ></button
          >
          {#if workspace.missing.includes(item.id)}
            <label class="repair"
              >{t('attach.repair', { name: item.filename })}<input
                type="file"
                onchange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void workspace.repairAttachment(item.id, file);
                  event.currentTarget.value = '';
                }}
              /></label
            >
          {/if}
        </li>
      {/each}
    </ul>
    {#if workspace.missing.length}
      <p class="missing" role="alert">
        {t('attach.missing')}
      </p>
    {/if}
  </div>
{/if}

<style>
  .attachments {
    flex: none;
    padding: var(--space-1) var(--space-3);
  }
  ul {
    --tile: clamp(3.5rem, 18vw, 5.5rem);
    display: grid;
    grid-template-columns: repeat(3, var(--tile));
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    position: relative;
    width: var(--tile);
    height: var(--tile);
    border-radius: calc(var(--radius) / 2);
    cursor: grab;
  }
  li.dragging {
    opacity: 0.4;
  }
  li.target {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  .tile {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: inherit;
    overflow: hidden;
    background: var(--accent-soft);
  }
  .tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
  .placeholder {
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--space-1);
    height: 100%;
    padding: 0 var(--space-1);
    font-size: 1.5rem;
  }
  .name {
    max-width: 100%;
    font-size: 0.625rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remove {
    position: absolute;
    top: 0.125rem;
    right: 0.125rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    min-height: 0;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.65);
    color: #fff;
  }
  .remove svg {
    width: 0.875rem;
    height: 0.875rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .repair {
    position: absolute;
    inset: auto 0 0;
    font-size: 0.625rem;
    background: var(--surface);
    overflow: hidden;
  }
  .missing {
    margin: var(--space-1) 0 0;
    font-size: 0.875rem;
  }
</style>
