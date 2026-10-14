<script lang="ts">
  import { selectTag, type TimelineFilters } from '#lib/shared/timeline.ts';
  import type { TimelineTag } from '#lib/shared/timeline.ts';
  let {
    tags,
    filters,
    onNavigate = () => {},
  }: {
    tags: readonly TimelineTag[];
    filters: TimelineFilters;
    onNavigate?: () => void;
  } = $props();
</script>

<!-- Tags flow as borderless chips. -->
<ul class="tag-flow">
  {#each tags as tag (tag.id)}
    <li>
      <span class="tag" class:active={filters.tag === tag.key}>
        <a
          href={selectTag(filters, tag.key)}
          aria-current={filters.tag === tag.key ? 'true' : undefined}
          onclick={onNavigate}
          >#{tag.label}
          <span class="count">({tag.count})</span></a
        >
      </span>
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
  .tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: var(--row-target);
    padding-inline: var(--space-3);
    border-radius: 999px;
    background: var(--accent-soft);
  }
  .tag.active {
    background: var(--accent);
  }
  .tag.active a,
  .tag.active .count {
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
</style>
