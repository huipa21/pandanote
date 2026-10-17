<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendLabelCommand } from '#lib/client/labels/api.ts';
  import type { LabelSummary } from '#lib/shared/labels.ts';
  import ActionMenu from './ActionMenu.svelte';
  import LabelEditor from './LabelEditor.svelte';
  import Modal from './Modal.svelte';

  let {
    label,
    onDeleted = async () => {},
  }: {
    label: LabelSummary;
    onDeleted?: () => Promise<unknown>;
  } = $props();
  const i18n = useI18n();
  const t = i18n.t;
  let editorOpen = $state(false);
  let deleteOpen = $state(false);
  let busy = $state(false);
  let message = $state('');
  let mutationId: string | undefined;
  async function remove() {
    if (busy) return;
    busy = true;
    message = '';
    try {
      mutationId ??= crypto.randomUUID();
      const result = await sendLabelCommand({
        action: 'delete',
        mutationId,
        labelId: label.id,
        expectedRevision: label.revision,
        confirmed: true,
      });
      if (!result.ok) {
        message = i18n.error(result.error);
        return;
      }
      deleteOpen = false;
      await onDeleted();
      await invalidateAll();
    } catch {
      message = t('err.labelSaveFailed');
    } finally {
      busy = false;
    }
  }
</script>

<ActionMenu
  label={t('labels.actions')}
  items={[
    {
      id: 'edit',
      label: t('note.edit'),
      icon: 'pencil',
      onSelect: () => {
        editorOpen = true;
      },
    },
    {
      id: 'delete',
      label: t('labels.deleteButton'),
      icon: 'trash',
      danger: true,
      onSelect: () => {
        message = '';
        deleteOpen = true;
      },
    },
  ]}
/>
<LabelEditor
  bind:open={editorOpen}
  {label}
  onSaved={() => void invalidateAll()}
/>
<Modal
  bind:open={deleteOpen}
  title={t('labels.deleteTitle')}
  dismissible={!busy}
  customHeader
>
  <p>{t('labels.deleteConfirm')}</p>
  {#if message}<p role="alert">{message}</p>{/if}
  <div class="confirm">
    <button type="button" class="danger" disabled={busy} onclick={remove}
      >{t('labels.deleteButton')}</button
    >
    <button
      type="button"
      disabled={busy}
      data-initial-focus
      onclick={() => {
        deleteOpen = false;
      }}>{t('note.cancel')}</button
    >
  </div>
</Modal>

<style>
  .confirm {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>
