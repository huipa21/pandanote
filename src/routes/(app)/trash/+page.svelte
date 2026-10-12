<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import SearchBox from '#lib/components/SearchBox.svelte';
  import StatusNoteList from '#lib/components/StatusNoteList.svelte';
  let { data } = $props();
  const id = $props.id();
  let query = $state(untrack(() => data.q));
  let ready = $state(false);
  // Trash search is its own query (Enter), not the sidebar's active-note search.
  $effect(() => {
    const q: string = data.q;
    untrack(() => {
      query = q;
    });
  });
  onMount(() => {
    ready = true;
  });
  function submit(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const q = query.trim();
    void goto(q ? `/trash?q=${encodeURIComponent(q)}` : '/trash', {
      reset: false,
    });
  }
</script>

<PageTitle title="Trash" />
<div class="trash-page">
  <h1>Trash</h1>
  <SearchBox
    {id}
    label="Search trash"
    maxlength={1024}
    disabled={!ready}
    bind:value={query}
    onkeydown={submit}
  />
  {#key `${data.tagGeneration}\u0000${data.q}`}<StatusNoteList
      status="trash"
      initial={data.statusList}
      initialError={data.statusError}
      q={data.q}
    />{/key}
</div>

<style>
  .trash-page {
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }
  h1 {
    margin: var(--space-2) 0 0;
  }
</style>
