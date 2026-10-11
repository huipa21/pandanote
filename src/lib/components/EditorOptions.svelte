<script lang="ts">
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import TimelineOptions from './TimelineOptions.svelte';
  import LocationOptions from './LocationOptions.svelte';

  let {
    workspace,
    onTag,
    onFiles,
  }: {
    workspace: EditorWorkspace | undefined;
    onTag: () => void;
    onFiles: () => void;
  } = $props();
  let dateOpen = $state(false);
  let locationOpen = $state(false);
  let locked = $derived(
    !workspace?.ready ||
      workspace.busy ||
      workspace.conflict ||
      workspace.frozen,
  );
  let locationLabel = $derived(
    workspace?.active?.location ? 'Edit location' : 'Add location',
  );
</script>

<div class="note-options" role="group" aria-label="Note options">
  <button
    type="button"
    disabled={locked}
    aria-label="Add tag"
    title="Tags"
    onclick={onTag}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17" /></svg
    >
  </button>
  <button
    type="button"
    disabled={locked}
    aria-label="Add photos or video"
    title="Photos or video"
    onclick={onFiles}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="3" y="4" width="18" height="16" rx="2" /><circle
        cx="9"
        cy="10"
        r="1.5"
      /><path d="m21 16-5-5-9 9" /></svg
    >
  </button>
  <button
    type="button"
    disabled={locked}
    aria-label="Set date"
    title="Date"
    onclick={() => (dateOpen = true)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="3" y="5" width="18" height="16" rx="2" /><path
        d="M3 10h18M8 3v4m8-4v4"
      /></svg
    >
  </button>
  <button
    type="button"
    disabled={locked}
    aria-label={locationLabel}
    title="Location"
    onclick={() => (locationOpen = true)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.800 12 21 12 21Z"
      /><circle cx="12" cy="9.5" r="2.5" /></svg
    >
  </button>
</div>
{#if workspace}
  <TimelineOptions {workspace} bind:open={dateOpen} showTrigger={false} />
  <LocationOptions {workspace} bind:open={locationOpen} showTrigger={false} />
{/if}

<style>
  .note-options {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .note-options button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--target);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
