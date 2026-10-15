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
      <span
        class="chip"
        class:active={filters.label === label.id}
        style:--label-bg={`var(--label-${label.color}-bg)`}
        style:--label-fg={`var(--label-${label.color}-fg)`}
      >
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
    padding-inline: var(--space-3);
    border-radius: var(--radius);
    background: var(--label-bg);
    color: var(--label-fg);
  }
  .chip.active {
    outline: 2px solid var(--label-fg);
    outline-offset: -2px;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  a:hover {
    text-decoration: underline;
  }
  .name {
    font-weight: 600;
  }
  .count {
    font-size: 0.8125rem;
    opacity: 0.8;
  }
  :global(.chip .icon) {
    width: 1rem;
    height: 1rem;
  }
</style>
