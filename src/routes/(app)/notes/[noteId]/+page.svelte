<script lang="ts">
  import PageTitle from '#lib/components/PageTitle.svelte';
  import NoteDetail from '#lib/components/NoteDetail.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let { data } = $props();
  const t = useI18n().t;
</script>

<PageTitle title={t('note.title')} />
<NoteDetail
  note={data.detail}
  rendered={data.rendered}
  timezone={data.timezone}
/>
