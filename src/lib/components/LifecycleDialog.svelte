<script lang="ts">
  import { getContext } from 'svelte';
  import { invalidate } from '$app/navigation';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  import Modal from './Modal.svelte';
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  // Immediate (silent) actions only surface this dialog after they fail.
  let open = $derived(
    Boolean(lifecycle.selected && !lifecycle.selected.silent),
  );
  const title = $derived(
    lifecycle.selected?.action === 'permanent-delete'
      ? 'Permanently delete note?'
      : lifecycle.selected?.action === 'restore'
        ? 'Restore note?'
        : lifecycle.selected?.action === 'pin'
          ? 'Pin note?'
          : lifecycle.selected?.action === 'unpin'
            ? 'Unpin note?'
            : 'Move to Trash?',
  );
</script>

<Modal
  bind:open
  {title}
  dismissible={!lifecycle.busy}
  onDismiss={() => {
    lifecycle.selected = null;
  }}
>
  {#if lifecycle.selected}
    <p>
      {lifecycle.selected.action === 'permanent-delete'
        ? 'Permanently remove this note and any files no other note references. This cannot be undone.'
        : lifecycle.selected.action === 'restore'
          ? 'Return this note to notes, preserving dates and files.'
          : lifecycle.selected.action === 'pin'
            ? 'Keep this note at the top of All notes.'
            : lifecycle.selected.action === 'unpin'
              ? 'Return this note to its date position.'
              : 'Keep this note and files in Trash. It disappears from notes, search and calendar.'}
    </p>
    {#if lifecycle.error}<p role="alert">{lifecycle.error}</p>{/if}
    {#if lifecycle.observed}<p>
        The server is now {lifecycle.observed.status}, revision {lifecycle
          .observed.revision}. Close and refresh the list before confirming a
        new action.
      </p>{/if}
    <a
      href={`/notes/${lifecycle.selected.target.id}`}
      aria-disabled={lifecycle.busy}
      onclick={(event) => {
        if (lifecycle.busy) event.preventDefault();
        else lifecycle.selected = null;
      }}>Inspect server note</a
    >
    {#if lifecycle.error}<button
        disabled={lifecycle.busy}
        onclick={() => {
          const note = lifecycle.observed ?? lifecycle.selected!.target;
          workspace.recordMutation({
            noteId: note.id,
            revision: note.revision,
            status: note.status,
            deleted: false,
          });
          lifecycle.selected = null;
          void invalidate('pandanote:timeline');
          void invalidate('pandanote:status-notes');
          void invalidate('pandanote:detail');
        }}>Refresh server version</button
      >{/if}
    <button
      class:danger={lifecycle.selected.action === 'permanent-delete'}
      disabled={lifecycle.busy || !lifecycle.ready}
      onclick={() => lifecycle.confirm()}
      >{lifecycle.busy
        ? 'Saving…'
        : lifecycle.selected.attempt
          ? 'Retry same action'
          : lifecycle.selected.action === 'permanent-delete'
            ? 'Confirm permanent delete'
            : lifecycle.selected.action === 'restore'
              ? 'Confirm restore'
              : lifecycle.selected.action === 'pin'
                ? 'Confirm pin'
                : lifecycle.selected.action === 'unpin'
                  ? 'Confirm unpin'
                  : 'Confirm move'}</button
    >
    {#if lifecycle.selected.attempt}<p class="help">
        Stopping retries does not undo or cancel an action that may already have
        succeeded.
      </p>
      <button
        disabled={lifecycle.busy}
        onclick={() => {
          if (lifecycle.selected?.attempt)
            lifecycle.forget(lifecycle.selected.attempt);
        }}>Stop retrying this action</button
      >{/if}
  {/if}
</Modal>
