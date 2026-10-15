<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import SearchBox from './SearchBox.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { loadTemplates } from '#lib/client/templates/api.ts';
  import {
    templateExcerpt,
    templateMatches,
    type NoteTemplate,
  } from '#lib/shared/templates.ts';

  /** Search and choose a template to insert into the current note text. */
  let {
    open = $bindable(false),
    onPick,
  }: {
    open?: boolean;
    onPick: (template: NoteTemplate) => void;
  } = $props();

  const i18n = useI18n();
  const t = i18n.t;
  const id = $props.id();

  let items = $state<NoteTemplate[]>([]);
  let query = $state('');
  let loading = $state(false);
  let error = $state('');
  let wasOpen = false;

  // Each opening fetches the current list, so templates deleted elsewhere are gone.
  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen && !wasOpen) {
        query = '';
        void load();
      }
      wasOpen = isOpen;
    });
  });

  async function load() {
    loading = true;
    error = '';
    try {
      const result = await loadTemplates();
      if (result.ok) items = result.data.items;
      else error = i18n.error(result.error);
    } catch {
      error = t('templates.loadFailed');
    } finally {
      loading = false;
    }
  }

  const visible = $derived(
    items.filter((item) => templateMatches(item, query)),
  );

  function choose(template: NoteTemplate) {
    open = false;
    onPick(template);
  }
</script>

<Modal bind:open title={t('templates.insertTitle')} kind="panel">
  <div class="picker">
    <SearchBox
      {id}
      label={t('templates.search')}
      maxlength={256}
      bind:value={query}
    />
    {#if error}<p role="alert">{error}</p>{/if}
    {#if loading}<p class="help">{t('templates.loadFailed')}</p>{/if}
    {#if visible.length}
      <ul class="choices">
        {#each visible as item (item.id)}
          <li>
            <button type="button" class="choice" onclick={() => choose(item)}>
              <span class="name">{item.name}</span>
              <span class="excerpt">{templateExcerpt(item.bodyMarkdown)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if !loading && !error}
      <p class="help">
        {items.length
          ? t('templates.pickerNoMatch')
          : t('templates.pickerNone')}
      </p>
    {/if}
  </div>
</Modal>

<style>
  .picker {
    display: grid;
    gap: var(--space-2);
  }
  .choices {
    display: grid;
    gap: var(--space-1);
    max-height: min(24rem, 60vh);
    overflow: auto;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .choice {
    display: grid;
    width: 100%;
    min-height: var(--target);
    gap: 0.125rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .choice:hover,
  .choice:focus-visible {
    background: var(--accent-soft);
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
  p {
    margin: 0;
  }
  .help {
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
