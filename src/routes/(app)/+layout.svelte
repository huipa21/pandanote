<script lang="ts">
  import { page } from '$app/state';
  import { onMount, setContext, untrack } from 'svelte';
  import {
    DRAFT_WORKSPACE,
    DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import AppShell from '#lib/components/AppShell.svelte';
  let { children, data } = $props();
  const workspace = new DraftWorkspace(
    untrack(() => data.account.id),
    untrack(() => data.timezone),
  );
  setContext(DRAFT_WORKSPACE, workspace);
  onMount(() => {
    let ended = false;
    let stop: (() => void) | undefined;
    void workspace.start().then((cleanup) => {
      if (ended) cleanup();
      else stop = cleanup;
    });
    return () => {
      ended = true;
      stop?.();
    };
  });
</script>

<AppShell active={page.url.pathname}>{@render children()}</AppShell>
