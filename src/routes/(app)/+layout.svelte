<script lang="ts">
  import { page } from '$app/state';
  import AppShell from '#lib/components/AppShell.svelte';
  let { children } = $props();
</script>

<AppShell active={page.url.pathname}>{@render children()}</AppShell>
