<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import SearchBox from '#lib/components/SearchBox.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import TemplateEditor from '#lib/components/TemplateEditor.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendTemplateCommand } from '#lib/client/templates/api.ts';
  import {
    templateExcerpt,
    templateMatches,
    type NoteTemplate,
  } from '#lib/shared/templates.ts';

  let { data } = $props();
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;

  let items = $state<NoteTemplate[]>(untrack(() => data.templates.items));
  let query = $state('');
  let ready = $state(false);
  let editorOpen = $state(false);
  let editing = $state<NoteTemplate | null>(null);
  let pending = $state(false);
  let bulkBusy = $state(false);
  let bulkMessage = $state('');
  let selectAllBox = $state<HTMLInputElement>();

  // Selection lives in memory and is limited to the templates currently shown.
  const selected = new SvelteSet<string>();
  // A lost delete response is retried with the same mutation ID for that template.
  const deleteIds = new SvelteMap<string, string>();

  // Server data (after any save/delete invalidation) replaces the local list.
  $effect(() => {
    const fresh: NoteTemplate[] = data.templates.items;
    untrack(() => {
      items = fresh;
    });
  });

  const visible = $derived(
    items.filter((item) => templateMatches(item, query)),
  );
  const allSelected = $derived(
    visible.length > 0 && visible.every((item) => selected.has(item.id)),
  );
  const selectedCount = $derived(
    visible.filter((item) => selected.has(item.id)).length,
  );

  $effect(() => {
    const shown = new Set(visible.map((item) => item.id));
    untrack(() => {
      for (const key of [...selected])
        if (!shown.has(key)) selected.delete(key);
      if (!selectedCount) pending = false;
    });
  });

  $effect(() => {
    if (selectAllBox)
      selectAllBox.indeterminate = selectedCount > 0 && !allSelected;
  });

  onMount(() => {
    ready = true;
  });

  function openNew() {
    editing = null;
    editorOpen = true;
  }
  function openEdit(template: NoteTemplate) {
    editing = template;
    editorOpen = true;
  }
  function toggleAll() {
    if (allSelected) for (const item of visible) selected.delete(item.id);
    else for (const item of visible) selected.add(item.id);
  }

  /** Deletes the selected templates one at a time; a failure stops the batch. */
  async function confirmDelete() {
    const batch = visible.filter((item) => selected.has(item.id));
    if (!batch.length || bulkBusy) return;
    pending = false;
    bulkBusy = true;
    bulkMessage = '';
    let done = 0;
    let stale = false;
    try {
      for (const item of batch) {
        let mutationId = deleteIds.get(item.id);
        if (!mutationId) {
          mutationId = crypto.randomUUID();
          deleteIds.set(item.id, mutationId);
        }
        let result;
        try {
          result = await sendTemplateCommand({
            action: 'delete',
            mutationId,
            templateId: item.id,
            expectedRevision: item.revision,
            confirmed: true,
          });
        } catch {
          bulkMessage = t('templates.deleteStopped', {
            done,
            total: batch.length,
          });
          break;
        }
        if (!result.ok) {
          stale = result.error.code === 'conflict';
          bulkMessage = stale
            ? i18n.error(result.error)
            : t('templates.deleteStopped', { done, total: batch.length });
          break;
        }
        deleteIds.delete(item.id);
        selected.delete(item.id);
        done++;
      }
    } finally {
      bulkBusy = false;
      // Re-read the list so a stale row (changed elsewhere) shows its current state.
      await invalidate('pandanote:templates');
      if (stale) bulkMessage = t('err.templateChanged');
    }
  }
</script>

<PageTitle title={t('templates.title')} />
<div class="templates-page">
  <h1>{t('templates.title')}</h1>
  <div class="search-row">
    <SearchBox
      {id}
      label={t('templates.search')}
      maxlength={256}
      disabled={!ready}
      bind:value={query}
    />
    <button
      type="button"
      class="primary new-template"
      disabled={!ready}
      onclick={openNew}>{t('templates.new')}</button
    >
  </div>
  {#if items.length}
    <div class="bulk-row">
      <input
        bind:this={selectAllBox}
        type="checkbox"
        class="pick"
        aria-label={t('templates.selectAll')}
        title={t('templates.selectAll')}
        checked={allSelected}
        disabled={!ready || bulkBusy || !visible.length}
        onchange={toggleAll}
      />
      <button
        type="button"
        class="icon-only danger"
        aria-label={t('templates.deleteSelected')}
        title={t('templates.deleteSelected')}
        disabled={!ready || bulkBusy || !selectedCount}
        onclick={() => {
          bulkMessage = '';
          pending = true;
        }}><Icon name="delete-forever" /></button
      >
      <span class="help" aria-live="polite"
        >{t('templates.selectedCount', { count: selectedCount })}</span
      >
    </div>
    {#if bulkMessage}<p role="alert">{bulkMessage}</p>{/if}
  {/if}
  {#if visible.length}
    <ul class="template-list">
      {#each visible as item (item.id)}
        <li class="surface template-row" class:selected={selected.has(item.id)}>
          <input
            type="checkbox"
            class="pick"
            checked={selected.has(item.id)}
            disabled={bulkBusy}
            aria-label={t('templates.selectOne', { name: item.name })}
            onchange={(event) => {
              if (event.currentTarget.checked) selected.add(item.id);
              else selected.delete(item.id);
            }}
          />
          <button
            type="button"
            class="open"
            disabled={bulkBusy}
            onclick={() => openEdit(item)}
          >
            <span class="name">{item.name}</span>
            <span class="excerpt">{templateExcerpt(item.bodyMarkdown)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if items.length}
    <p class="muted">{t('templates.noMatch')}</p>
  {:else}
    <p class="muted">{t('templates.none')}</p>
  {/if}
</div>

<TemplateEditor
  bind:open={editorOpen}
  template={editing}
  onSaved={() => void invalidate('pandanote:templates')}
/>

<Modal
  bind:open={
    () => pending && selectedCount > 0,
    (value) => {
      if (!value) pending = false;
    }
  }
  title={t('templates.deleteTitle')}
  dismissible={!bulkBusy}
  customHeader
>
  <p>
    {selectedCount === 1
      ? t('templates.deleteOne')
      : t('templates.deleteMany', { count: selectedCount })}
  </p>
  <div class="confirm">
    <button type="button" class="danger" onclick={confirmDelete}
      >{t('templates.deleteConfirm')}</button
    >
    <button type="button" data-initial-focus onclick={() => (pending = false)}
      >{t('note.cancel')}</button
    >
  </div>
</Modal>

<style>
  .templates-page {
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }
  h1 {
    margin: var(--space-2) 0 0;
  }
  .search-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .search-row :global(.search-box) {
    flex: 1 1 16rem;
  }
  .bulk-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .icon-only {
    width: var(--target);
    height: var(--target);
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pick {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin: 0;
    accent-color: var(--accent);
  }
  .template-list {
    display: grid;
    gap: var(--space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .template-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
  }
  .template-row.selected {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .open {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.125rem;
    padding: var(--space-1) var(--space-2);
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .excerpt {
    color: var(--muted);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
