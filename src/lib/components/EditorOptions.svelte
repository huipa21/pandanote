<script lang="ts">
  import { tick } from 'svelte';
  import type { DraftWorkspace } from '#lib/client/drafts/workspace.svelte.ts';
  import TimelineOptions from './TimelineOptions.svelte';
  import LocationOptions from './LocationOptions.svelte';

  let {
    workspace,
    onTag,
    onFiles,
  }: {
    workspace: DraftWorkspace | undefined;
    onTag: () => void;
    onFiles: () => void;
  } = $props();
  const id = $props.id();
  let menu = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let showing = $state(false);
  let dateOpen = $state(false);
  let locationOpen = $state(false);
  let locked = $derived(
    !workspace?.ready ||
      workspace.busy ||
      workspace.conflict ||
      workspace.frozen,
  );

  function select(action: 'tags' | 'files' | 'date' | 'location') {
    menu?.hidePopover();
    trigger?.focus();
    if (action === 'tags') onTag();
    else if (action === 'files') onFiles();
    else if (action === 'date') dateOpen = true;
    else locationOpen = true;
  }
  async function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      menu?.hidePopover();
      trigger?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      menu?.showPopover();
      await tick();
      const buttons = [
        ...(menu?.querySelectorAll<HTMLButtonElement>('button') ?? []),
      ];
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        index < 0
          ? step > 0
            ? 0
            : buttons.length - 1
          : (index + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
</script>

<div class="options-anchor">
  <button
    bind:this={trigger}
    class="add-options"
    type="button"
    aria-label="Add note options"
    aria-expanded={showing}
    aria-controls={id}
    popovertarget={id}
    disabled={locked}
    onkeydown={keydown}
    title="Tags, files, date, location">+</button
  >
  <div
    bind:this={menu}
    {id}
    popover="auto"
    class="options-menu"
    role="group"
    aria-label="Note options"
    ontoggle={(event) => {
      showing = event.newState === 'open';
    }}
  >
    <button
      type="button"
      disabled={locked}
      onkeydown={keydown}
      onclick={() => select('tags')}>Tags</button
    >
    <button
      type="button"
      disabled={locked}
      onkeydown={keydown}
      onclick={() => select('files')}
      aria-label="Add files">Files</button
    >
    <button
      type="button"
      disabled={locked}
      onkeydown={keydown}
      onclick={() => select('date')}>Date</button
    >
    <button
      type="button"
      disabled={locked}
      onkeydown={keydown}
      onclick={() => select('location')}
      aria-label={workspace?.active?.location
        ? 'Edit location'
        : 'Add location'}>Location</button
    >
  </div>
</div>
{#if workspace}
  <TimelineOptions {workspace} bind:open={dateOpen} showTrigger={false} />
  <LocationOptions {workspace} bind:open={locationOpen} showTrigger={false} />
{/if}

<style>
  .options-anchor {
    position: relative;
    anchor-scope: --editor-options;
  }
  .add-options {
    width: var(--target);
    padding: 0;
    border: 0;
    font-size: 1.5rem;
    color: var(--muted);
  }
  .options-menu {
    /* Native top-layer popover, anchored above + even in a scrolling editor. */
    position: absolute;
    inset: auto;
    bottom: anchor(top);
    left: anchor(left);
    position-anchor: --editor-options;
    margin: 0 0 var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 4px 16px var(--overlay);
    max-height: min(16rem, 70dvh);
    overflow: auto;
  }
  .add-options {
    anchor-name: --editor-options;
  }
  .options-menu:popover-open {
    display: grid;
    min-width: 9rem;
  }
  .options-menu button {
    border: 0;
    text-align: left;
  }
</style>
