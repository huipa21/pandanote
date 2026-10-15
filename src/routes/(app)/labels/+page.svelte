<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { SvelteMap } from 'svelte/reactivity';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import Icon, { type IconName } from '#lib/components/Icon.svelte';
  import ActionMenu, {
    type ActionMenuItem,
  } from '#lib/components/ActionMenu.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import LabelEditor from '#lib/components/LabelEditor.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendLabelCommand } from '#lib/client/labels/api.ts';
  import type { LabelSummary } from '#lib/shared/labels.ts';

  let { data } = $props();
  const i18n = useI18n();
  const t = i18n.t;

  let items = $derived(data.labels.items);
  let ready = $state(false);
  let editorOpen = $state(false);
  let editing = $state<LabelSummary | null>(null);
  let pendingDelete = $state<LabelSummary | null>(null);
  let bulkBusy = $state(false);
  let message = $state('');
  const deleteIds = new SvelteMap<string, string>();

  onMount(() => {
    ready = true;
  });

  function openNew() {
    editing = null;
    editorOpen = true;
  }
  function openEdit(label: LabelSummary) {
    editing = label;
    editorOpen = true;
  }

  function menuItems(label: LabelSummary): ActionMenuItem[] {
    return [
      {
        id: 'edit',
        label: t('note.edit'),
        icon: 'pencil',
        onSelect: () => openEdit(label),
      },
      {
        id: 'delete',
        label: t('labels.deleteButton'),
        icon: 'trash',
        danger: true,
        onSelect: () => {
          message = '';
          pendingDelete = label;
        },
      },
    ];
  }

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target || bulkBusy) return;
    bulkBusy = true;
    message = '';
    try {
      let mutationId = deleteIds.get(target.id);
      if (!mutationId) {
        mutationId = crypto.randomUUID();
        deleteIds.set(target.id, mutationId);
      }
      const result = await sendLabelCommand({
        action: 'delete',
        mutationId,
        labelId: target.id,
        expectedRevision: target.revision,
        confirmed: true,
      });
      if (!result.ok) {
        message = i18n.error(result.error);
        return;
      }
      deleteIds.delete(target.id);
      pendingDelete = null;
    } catch {
      message = t('err.labelSaveFailed');
    } finally {
      bulkBusy = false;
      await invalidate('pandanote:labels');
    }
  }
</script>

<PageTitle title={t('labels.title')} />
<div class="labels-page">
  <div class="header-row">
    <h1>{t('labels.title')}</h1>
    <button type="button" class="primary" disabled={!ready} onclick={openNew}
      >{t('labels.new')}</button
    >
  </div>
  {#if message}<p role="alert">{message}</p>{/if}
  {#if items.length}
    <ul class="label-list">
      {#each items as item (item.id)}
        <li class="surface label-row">
          <button
            type="button"
            class="open"
            style:--label-bg={`var(--label-${item.color}-bg)`}
            style:--label-fg={`var(--label-${item.color}-fg)`}
            onclick={() => openEdit(item)}
          >
            <span class="chip"
              >{#if item.icon}<Icon name={item.icon as IconName} />{/if}<span
                >{item.name}</span
              ></span
            >
            <span class="count"
              >{t('labels.noteCount', { count: item.noteCount })}</span
            >
          </button>
          <ActionMenu label={t('labels.actions')} items={menuItems(item)} />
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{t('labels.none')}</p>
  {/if}
</div>

<LabelEditor
  bind:open={editorOpen}
  label={editing}
  onSaved={() => void invalidate('pandanote:labels')}
/>

<Modal
  bind:open={
    () => pendingDelete !== null,
    (value) => {
      if (!value) pendingDelete = null;
    }
  }
  title={t('labels.deleteTitle')}
  dismissible={!bulkBusy}
  customHeader
>
  <p>{t('labels.deleteConfirm')}</p>
  <div class="confirm">
    <button type="button" class="danger" onclick={confirmDelete}
      >{t('labels.deleteButton')}</button
    >
    <button
      type="button"
      data-initial-focus
      onclick={() => (pendingDelete = null)}>{t('note.cancel')}</button
    >
  </div>
</Modal>

<style>
  .labels-page {
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }
  h1 {
    margin: var(--space-2) 0 0;
  }
  .header-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }
  .label-list {
    display: grid;
    gap: var(--space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
  }
  .open {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding-inline: var(--space-3);
    min-height: var(--target);
    border-radius: var(--radius);
    background: var(--label-bg);
    color: var(--label-fg);
    font-weight: 600;
  }
  .count {
    color: var(--muted);
    font-size: 0.875rem;
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
  }
  p {
    margin: 0;
  }
</style>
