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

  function fontFamily(font: LabelSummary['font']): string | undefined {
    if (!font) return undefined;
    return `var(--font-${font === 'mono' ? 'code' : font})`;
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
    <ul class="label-grid">
      {#each items as item (item.id)}
        <li class="label-tile">
          <div
            class="tile-card surface"
            style:background={item.background
              ? `var(--label-${item.background}-bg)`
              : undefined}
          >
            <div
              class="tile-top"
              style:background={item.headerColor
                ? `var(--label-${item.headerColor}-bg)`
                : undefined}
              style:color={item.headerColor
                ? `var(--label-${item.headerColor}-fg)`
                : undefined}
            >
              <button
                type="button"
                class="chip-button"
                style:--label-bg={`var(--label-${item.color}-bg)`}
                style:--label-fg={`var(--label-${item.color}-fg)`}
                onclick={() => openEdit(item)}
              >
                <span class="chip"
                  >{#if item.icon}<Icon
                      name={item.icon as IconName}
                    />{/if}<span>{item.name}</span></span
                >
              </button>
              <ActionMenu label={t('labels.actions')} items={menuItems(item)} />
            </div>
            <button
              type="button"
              class="tile-body"
              onclick={() => openEdit(item)}
            >
              <p class="sample" style:font-family={fontFamily(item.font)}>
                {t('labels.previewBody')}
              </p>
            </button>
            <p class="count">
              {t('labels.noteCount', { count: item.noteCount })}
            </p>
          </div>
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
  /* Masonry via CSS multi-column flow: tiles can have different heights
     (longer names, note counts) and pack without gaps, no JS library. */
  .label-grid {
    columns: 16rem;
    column-gap: var(--space-4);
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .label-tile {
    display: inline-block;
    width: 100%;
    break-inside: avoid;
    margin-bottom: var(--space-4);
  }
  .tile-card {
    display: grid;
    border-radius: var(--radius);
    overflow: hidden;
  }
  .tile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }
  .chip-button {
    min-width: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
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
    overflow-wrap: anywhere;
  }
  @media (pointer: fine) {
    .chip {
      min-height: 1.75rem;
    }
  }
  .tile-body {
    display: block;
    width: 100%;
    border: 0;
    border-top: 1px solid var(--border);
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .sample {
    margin: 0;
    padding: var(--space-3);
    font-size: 0.875rem;
    color: var(--muted);
  }
  .count {
    margin: 0;
    padding: 0 var(--space-3) var(--space-3);
    color: var(--muted);
    font-size: 0.8125rem;
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
