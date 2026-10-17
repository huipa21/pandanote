<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import LabelChip from '#lib/components/LabelChip.svelte';
  import SearchBox from '#lib/components/SearchBox.svelte';
  import LabelActions from '#lib/components/LabelActions.svelte';
  import LabelEditor from '#lib/components/LabelEditor.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { matchesSearch, parseSearch } from '#lib/shared/search.ts';
  import { labelNameKey } from '#lib/shared/labels.ts';

  let { data } = $props();
  const i18n = useI18n();
  const t = i18n.t;

  let items = $derived(data.labels.items);
  const id = $props.id();
  let query = $state('');
  let search = $state<ReturnType<typeof parseSearch>>(parseSearch(''));
  let searchError = $state('');
  const visibleItems = $derived(
    items.filter((item) =>
      matchesSearch([labelNameKey(item.name)], search, [
        labelNameKey(item.name),
      ]),
    ),
  );
  let ready = $state(false);
  let editorOpen = $state(false);

  onMount(() => {
    ready = true;
  });

  function openNew() {
    editorOpen = true;
  }

  function submit(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    try {
      search = parseSearch(query);
      searchError = '';
    } catch (error) {
      searchError =
        error instanceof Error ? error.message : t('search.checkQuery');
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
  <SearchBox
    {id}
    label={t('labels.title')}
    maxlength={256}
    disabled={!ready}
    bind:value={query}
    onkeydown={submit}
  />
  {#if searchError}<p role="alert">{searchError}</p>{/if}
  {#if visibleItems.length}
    <ul class="label-cloud">
      {#each visibleItems as item (item.id)}
        <li>
          <a class="label-link" href={`/?label=${item.id}`}>
            <LabelChip label={item} /><span class="count">{item.noteCount}</span
            >
          </a>
          <LabelActions label={item} />
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{t('labels.none')}</p>
  {/if}
</div>

<LabelEditor
  bind:open={editorOpen}
  label={null}
  onSaved={() => void invalidate('pandanote:labels')}
/>

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
  .label-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .label-cloud li {
    display: flex;
    align-items: center;
    max-width: 100%;
    border-radius: 999px;
    background: var(--accent-soft);
  }
  .label-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .label-link :global(.label-chip) {
    padding: 0;
    min-height: 0;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .label-cloud li:hover {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }
  .count {
    color: var(--muted);
    font-size: 0.8125rem;
  }
  p {
    margin: 0;
  }
</style>
