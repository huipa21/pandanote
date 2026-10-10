<script lang="ts">
  import Modal from './Modal.svelte';
  import { timelineInput, timelineInstant } from '#lib/client/uploads/date.ts';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  let {
    workspace,
    open = $bindable(false),
    showTrigger = true,
  }: {
    workspace: EditorWorkspace;
    open?: boolean;
    showTrigger?: boolean;
  } = $props();
  let error = $state('');
  $effect(() => {
    if (open) error = '';
  });
</script>

{#if showTrigger}<button
    disabled={!workspace.active ||
      workspace.busy ||
      workspace.frozen ||
      workspace.conflict}
    onclick={() => {
      open = true;
      error = '';
    }}>Date</button
  >{/if}
<Modal bind:open title="Timeline date">
  <p>
    Choose now or earlier, in the configured app timezone. Ambiguous or
    nonexistent daylight-saving times are rejected.
  </p>
  {#if workspace.active}
    <label
      >Timeline date/time ({workspace.timezone})
      <input
        type="datetime-local"
        step="1"
        value={timelineInput(workspace.active.timelineAt, workspace.timezone)}
        disabled={workspace.busy || workspace.frozen || workspace.conflict}
        onchange={(event) => {
          try {
            workspace.updateMetadata({
              timelineAt: timelineInstant(
                event.currentTarget.value,
                workspace.timezone,
              ),
              location: workspace.active!.location,
            });
            error = '';
          } catch {
            error =
              'Choose a valid, unambiguous date/time that is now or earlier.';
          }
        }}
      />
    </label>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</Modal>

<style>
  input {
    max-width: 100%;
  }
  @media (max-width: 899px) and (max-height: 400px) {
    button {
      min-height: 2rem;
      padding-block: 0;
    }
  }
</style>
