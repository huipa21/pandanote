<script lang="ts">
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  const t = useI18n().t;
  let { workspace }: { workspace: EditorWorkspace } = $props();
</script>

<Modal
  bind:open={workspace.confirmModalOpen}
  title={t('unsaved.title')}
  onDismiss={() => workspace.cancelConfirm()}
  dismissible={!workspace.posting}
>
  <p>
    {t('unsaved.help')}
  </p>
  {#if workspace.frozen}<p>
      {t('unsaved.frozen')}
    </p>{/if}
  {#if workspace.postError}<p role="alert">{workspace.postError}</p>{/if}
  <div class="confirm-actions">
    <button
      class="primary"
      disabled={!workspace.canPost}
      onclick={() => void workspace.confirmSaveAndProceed()}
    >
      {workspace.active?.kind === 'edit'
        ? t('unsaved.saveChanges')
        : t('unsaved.post')}
    </button>
    <button
      class="danger"
      disabled={workspace.busy || workspace.posting}
      onclick={() => workspace.confirmDiscard()}
    >
      {t('unsaved.discard')}
    </button>
    <button
      type="button"
      disabled={workspace.posting}
      onclick={() => workspace.cancelConfirm()}
    >
      {t('note.cancel')}
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
