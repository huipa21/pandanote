<script lang="ts">
  import { selectLabel, type TimelineFilters } from '#lib/shared/timeline.ts';
  import type { LabelSummary } from '#lib/shared/labels.ts';
  import Icon, { type IconName } from './Icon.svelte';
  let {
    labels,
    filters,
    onNavigate = () => {},
  }: {
    labels: readonly LabelSummary[];
    filters: TimelineFilters;
    onNavigate?: () => void;
  } = $props();
</script>

<!-- Labels flow as borderless chips, like tags but visually distinct (icon/swatch). -->
<ul class="label-flow">
  {#each labels as label (label.id)}
    <li>
      <span class="chip" class:active={filters.label === label.id}>
        <a
          href={selectLabel(filters, label.id)}
          aria-current={filters.label === label.id ? 'true' : undefined}
          onclick={onNavigate}
          >{#if label.icon}<Icon name={label.icon as IconName} />{/if}<span
            class="name">{label.name}</span
          >
          <span class="count">({label.noteCount})</span></a
        >
      </span>
    </li>
  {/each}
</ul>

<style>
  .label-flow {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: var(--row-target);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .chip.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .chip.active .count {
    color: var(--on-accent);
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
    min-width: 0;
    min-height: var(--row-target);
    padding-inline: var(--space-3);
  }
  a:hover {
    text-decoration: underline;
  }
  .name {
    font-weight: inherit;
  }
  .count {
    font-size: 0.8125rem;
    color: var(--muted);
  }
  :global(.chip .icon) {
    width: 1rem;
    height: 1rem;
  }
</style>
