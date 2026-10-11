<script lang="ts">
  import TagTree from './TagTree.svelte';
  import type { SvelteSet } from 'svelte/reactivity';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { TagNode } from '#lib/shared/tag-tree.ts';
  import { selectTag, type TimelineFilters } from '#lib/shared/timeline.ts';
  let {
    nodes,
    filters,
    expanded,
    nested = false,
    onNavigate = () => {},
  }: {
    nodes: readonly TagNode[];
    filters: TimelineFilters;
    /** Keys the user expanded. */
    expanded: SvelteSet<string>;
    nested?: boolean;
    onNavigate?: () => void;
  } = $props();
  const t = useI18n().t;
</script>

<!-- Tags flow as borderless chips; a chevron reveals subtags on their own row. -->
<ul class="tag-flow" class:nested>
  {#each nodes as node (node.key)}
    {@const open = node.children.length > 0 && expanded.has(node.key)}
    <li class:open>
      <span class="tag" class:active={filters.tag === node.key}>
        <a
          href={selectTag(filters, node.key)}
          title={t('shell.tagCount', { tag: node.display, count: node.count })}
          aria-label={node.display === node.label
            ? undefined
            : `#${node.display} (${node.count})`}
          aria-current={filters.tag === node.key ? 'true' : undefined}
          onclick={onNavigate}
          ><!-- Only the last level is shown; the accessible name keeps the full path. -->#{node.label}
          <span class="count">({node.count})</span></a
        >{#if node.children.length}<button
            type="button"
            class="disclosure"
            aria-expanded={open}
            aria-label={t(open ? 'shell.collapseTag' : 'shell.expandTag', {
              tag: node.display,
            })}
            onclick={() => {
              if (open) expanded.delete(node.key);
              else expanded.add(node.key);
            }}
            ><svg aria-hidden="true" viewBox="0 0 20 20" class:flipped={open}
              ><path d="m5 8 5 5 5-5" /></svg
            ></button
          >{/if}
      </span>
      {#if open}<TagTree
          nodes={node.children}
          {filters}
          {expanded}
          nested
          {onNavigate}
        />{/if}
    </li>
  {/each}
</ul>

<style>
  .tag-flow {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .nested {
    margin-block: var(--space-1);
    padding-inline-start: var(--space-3);
  }
  li.open {
    flex-basis: 100%;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: var(--row-target);
    padding-inline: var(--space-3);
    border-radius: 999px;
    background: var(--accent-soft);
  }
  .tag:has(.disclosure) {
    padding-inline-end: var(--space-1);
  }
  .tag.active {
    background: var(--accent);
  }
  .tag.active a,
  .tag.active .count,
  .tag.active .disclosure {
    color: var(--on-accent);
  }
  .tag.active .disclosure:hover:not(:disabled) {
    color: var(--on-accent);
  }
  a {
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  a:hover {
    text-decoration: underline;
  }
  .count {
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .disclosure {
    display: grid;
    place-items: center;
    flex: none;
    min-height: 0;
    width: 1.5rem;
    height: 1.5rem;
    margin-inline-start: var(--space-1);
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
  }
  .disclosure:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .disclosure svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .disclosure svg.flipped {
    transform: rotate(180deg);
  }
</style>
