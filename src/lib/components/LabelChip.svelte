<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';
  import type { LabelSummary } from '#lib/shared/labels.ts';

  /**
   * Card/detail label chip. The name is always rendered as real text (never a
   * color-only dot), so color-blind and no-color (forced-colors/high-contrast)
   * users and screen readers still identify the label.
   */
  let { label }: { label: LabelSummary } = $props();
</script>

<span
  class="label-chip"
  style:--label-bg={`var(--label-${label.color}-bg)`}
  style:--label-fg={`var(--label-${label.color}-fg)`}
>
  {#if label.icon}<Icon name={label.icon as IconName} />{/if}<span
    >{label.name}</span
  >
</span>

<style>
  .label-chip {
    display: inline-flex;
    max-width: 100%;
    overflow-wrap: anywhere;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--target);
    padding-inline: var(--space-3);
    border-radius: var(--radius);
    background: var(--label-bg);
    color: var(--label-fg);
    font-weight: 600;
    font-size: 0.875rem;
  }
  @media (pointer: fine) {
    .label-chip {
      min-height: 1.75rem;
    }
  }
  .label-chip :global(.icon) {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }
</style>
