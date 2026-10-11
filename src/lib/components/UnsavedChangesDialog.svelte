<script lang="ts">
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import Modal from './Modal.svelte';
  let { workspace }: { workspace: EditorWorkspace } = $props();
</script>

<Modal
  bind:open={workspace.confirmModalOpen}
  title="Unsaved changes"
  onDismiss={() => workspace.cancelConfirm()}
  dismissible={!workspace.posting}
>
  <p>
    You have unsaved changes. Do you want to post/save your changes, discard
    them, or cancel?
  </p>
  {#if workspace.frozen}<p>
      This save may already have succeeded. Discard only abandons this editor;
      it does not undo a server save.
    </p>{/if}
  {#if workspace.postError}<p role="alert">{workspace.postError}</p>{/if}
  <div class="confirm-actions">
    <button
      class="primary"
      disabled={!workspace.canPost}
      onclick={() => void workspace.confirmSaveAndProceed()}
    >
      {workspace.active?.kind === 'edit' ? 'Save changes' : 'Post'}
    </button>
    <button
      class="danger"
      disabled={workspace.busy || workspace.posting}
      onclick={() => workspace.confirmDiscard()}
    >
      Discard
    </button>
    <button
      type="button"
      disabled={workspace.posting}
      onclick={() => workspace.cancelConfirm()}
    >
      Cancel
    </button>
  </div>
</Modal>

<style>
  .confirm-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    justify-content: flex-end;
  }
</style>
