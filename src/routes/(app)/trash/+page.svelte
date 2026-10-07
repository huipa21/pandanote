<script lang="ts">
  import PageTitle from '#lib/components/PageTitle.svelte';
  import StatusNoteList from '#lib/components/StatusNoteList.svelte';
  let { data } = $props();
</script>

<PageTitle title="Trash" />
<section class="surface">
  <h1>Trash</h1>
  <p>
    Notes and files stay here until you explicitly restore or permanently delete
    them. There is no automatic emptying. Files in Trash still count toward
    storage.
  </p>
  <p class="help">
    Restore returns each note to its prior published or draft status, preserving
    dates and files. Permanent deletion never removes device-only recovery
    copies.
  </p>
</section>
{#key data.tagGeneration}<StatusNoteList
    status="trash"
    initial={data.statusList}
    initialError={data.statusError}
  />{/key}
