<script lang="ts">
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let { title }: { title: string } = $props();
  const i18n = useI18n();
</script>

<svelte:head><title>{i18n.pageTitle(title)}</title></svelte:head>
