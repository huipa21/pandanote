<script lang="ts">
  import { goto } from '$app/navigation';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import NoteDetail from '#lib/components/NoteDetail.svelte';
  let { data } = $props();
</script>

<PageTitle title="Note" />
<NoteDetail
  note={data.detail}
  rendered={data.rendered}
  onLeave={() => goto('/', { reset: false })}
/>
