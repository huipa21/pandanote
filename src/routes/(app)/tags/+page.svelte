<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import PendingTagOps from '#lib/components/PendingTagOps.svelte';
  import SearchBox from '#lib/components/SearchBox.svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import { TagOperations } from '#lib/client/tags/operations.svelte.ts';
  import type { ApiResult } from '#lib/shared/domain.ts';
  import type { ManagedTag } from '#lib/shared/tags.ts';
  import { filterHref } from '#lib/shared/timeline.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let { data } = $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const ops = new TagOperations(workspace);
  const id = $props.id();
  const t = useI18n().t;
  type Page = { items: ManagedTag[]; nextOffset: number | null };
  let items = $state<ManagedTag[]>(untrack(() => data.tagPage.items));
  let nextOffset = $state<number | null>(
    untrack(() => data.tagPage.nextOffset),
  );
  let query = $state(untrack(() => data.q));
  let loading = $state(false);
  let failed = $state(false);
  let ready = $state(false);
  let sentinel = $state<HTMLElement>();
  let generation = 0;
  // A new search or a tag change replaces the whole list.
  $effect(() => {
    const page: Page = data.tagPage;
    const q: string = data.q;
    untrack(() => {
      generation++;
      loading = false;
      failed = false;
      items = page.items;
      nextOffset = page.nextOffset;
      query = q;
    });
  });
  onMount(() => {
    ready = true;
    const stop = ops.start();
    return () => {
      generation++;
      stop();
    };
  });
  async function loadMore() {
    if (nextOffset === null || loading) return;
    const current = ++generation;
    loading = true;
    failed = false;
    try {
      const params = new URLSearchParams({
        q: data.q,
        offset: String(nextOffset),
        limit: '60',
      });
      const response = await fetch(`/api/tags?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as ApiResult<Page>;
      if (current !== generation) return;
      if (!result.ok) throw new Error(result.error.message);
      const seen = new Set(items.map((tag) => tag.key));
      items = [...items, ...result.data.items.filter((t) => !seen.has(t.key))];
      nextOffset = result.data.nextOffset;
    } catch {
      if (current === generation) failed = true;
    } finally {
      if (current === generation) loading = false;
    }
  }
  $effect(() => {
    if (!ready || !sentinel || nextOffset === null || failed) return;
    const root = sentinel.closest<HTMLElement>('#notes-pane');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: '0px 0px 300px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
  function submit(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const q = query.trim();
    void goto(q ? `/tags?q=${encodeURIComponent(q)}` : '/tags', {
      reset: false,
    });
  }
</script>

<PageTitle title={t('shell.tags')} />
<div class="tags-page">
  <h1>{t('shell.tags')}</h1>
  <SearchBox
    {id}
    label={t('tags.search')}
    maxlength={256}
    disabled={!ready}
    bind:value={query}
    onkeydown={submit}
  />
  <PendingTagOps {ops} />
  {#if ops.error}<p role="alert">{ops.error}</p>{/if}
  {#if items.length}
    <ul class="tag-cloud">
      {#each items as tag (tag.key)}
        <li>
          <a href={filterHref({ tag: tag.key })}
            >#{tag.display}<span class="count">{tag.published}</span></a
          >
        </li>
      {/each}
    </ul>
  {:else}<p class="muted">{t('tags.none')}</p>{/if}
  <div bind:this={sentinel} class="more" aria-live="polite">
    {#if failed}<button onclick={loadMore}>{t('tags.retry')}</button>
    {/if}
  </div>
</div>

<style>
  .tags-page {
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }
  h1 {
    margin: var(--space-2) 0 0;
  }
  .tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .tag-cloud a {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .tag-cloud a:hover {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }
  .count {
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .more {
    min-height: 1px;
    text-align: center;
  }
</style>
