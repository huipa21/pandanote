<script lang="ts">
  import { goto } from '$app/navigation';
  import NoteDetail from '#lib/components/NoteDetail.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Note — PandaNote</title></svelte:head>
<NoteDetail
  note={data.detail}
  rendered={data.rendered}
  direct
  onClose={() => goto('/', { reset: false })}
/>
