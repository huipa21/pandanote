<script lang="ts">
  import TagTree from './TagTree.svelte';
  import type { SvelteSet } from 'svelte/reactivity';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { TagNode } from '#lib/shared/tag-tree.ts';
  import { toggleTag, type TimelineFilters } from '#lib/shared/timeline.ts';
  let {
    nodes,
    filters,
    expanded,
    revealed = new Set<string>(),
    nested = false,
    onNavigate = () => {},
  }: {
    nodes: readonly TagNode[];
    filters: TimelineFilters;
    /** Keys the user expanded (shared by the compact list and the modal). */
    expanded: SvelteSet<string>;
    /** Extra keys shown expanded, e.g. ancestors of search matches. */
    revealed?: ReadonlySet<string>;
    nested?: boolean;
    onNavigate?: () => void;
  } = $props();
  const t = useI18n().t;
</script>

<ul class="tag-tree" class:nested>
  {#each nodes as node (node.key)}
    {@const open =
      node.children.length > 0 &&
      (expanded.has(node.key) || revealed.has(node.key))}
    <li>
      <div class="tag-row">
        {#if node.children.length}<button
            type="button"
            class="disclosure"
            aria-expanded={open}
            aria-label={t(open ? 'shell.collapseTag' : 'shell.expandTag', {
              tag: node.display,
            })}
            onclick={() => {
              if (open) expanded.delete(node.key);
              else expanded.add(node.key);
            }}><span aria-hidden="true">{open ? '▾' : '▸'}</span></button
          >{:else}<span class="disclosure-space" aria-hidden="true"></span>{/if}
        <a
          href={toggleTag(filters, node.key)}
          title={t('shell.tagCount', { tag: node.display, count: node.count })}
          aria-label={node.display === node.label
            ? undefined
            : `#${node.display} (${node.count})`}
          aria-current={filters.tags.includes(node.key) ? 'true' : undefined}
          onclick={onNavigate}
          ><!-- Only the last level is shown; the accessible name keeps the full path. -->#{node.label}
          <span class="muted">({node.count})</span></a
        >
      </div>
      {#if open}<TagTree
          nodes={node.children}
          {filters}
          {expanded}
          {revealed}
          nested
          {onNavigate}
        />{/if}
    </li>
  {/each}
</ul>

<style>
  .tag-tree {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .nested {
    padding-inline-start: var(--space-4);
  }
  .tag-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .disclosure,
  .disclosure-space {
    flex: none;
    width: 2rem;
    min-height: var(--row-target);
  }
  .disclosure {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .disclosure:hover {
    color: var(--accent);
  }
  a {
    display: block;
    flex: 1;
    min-width: 0;
    min-height: var(--row-target);
    padding-block: var(--space-1);
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  a[aria-current='true'] {
    font-weight: 650;
    background: var(--accent-soft);
  }
</style>
