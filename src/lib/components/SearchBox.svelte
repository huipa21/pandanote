<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  /**
   * The one search field look: slim, magnifier first, filter control last. The
   * filter control is a placeholder for now and stays inert.
   */
  const t = useI18n().t;
  let {
    value = $bindable(''),
    label,
    filterLabel = t('search.filter'),
    id,
    ...rest
  }: {
    value?: string;
    /** Accessible name; never visible. */
    label: string;
    filterLabel?: string;
    id: string;
  } & Omit<HTMLInputAttributes, 'value' | 'type' | 'id'> = $props();
</script>

<div class="search-box" class:invalid={rest['aria-invalid']}>
  <svg aria-hidden="true" viewBox="0 0 20 20" class="icon">
    <circle cx="8.5" cy="8.5" r="5.25" />
    <path d="m12.5 12.5 4 4" />
  </svg>
  <label class="sr-only" for={id}>{label}</label>
  <input {id} type="search" bind:value {...rest} />
  <button type="button" class="filter" aria-label={filterLabel} disabled>
    <svg aria-hidden="true" viewBox="0 0 20 20" class="icon">
      <path d="M3 5.5h14M6 10h8M8.5 14.5h3" />
    </svg>
  </button>
</div>

<style>
  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 2.25rem;
    padding-inline: var(--space-3);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--muted);
  }
  .search-box:focus-within {
    outline: var(--focus-width) solid var(--accent);
    outline-offset: 2px;
  }
  .invalid {
    outline: 2px solid var(--danger);
  }
  .icon {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 2.25rem;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text);
    appearance: none;
  }
  input:focus-visible {
    outline: none;
  }
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  .filter {
    flex: none;
    display: grid;
    place-items: center;
    min-height: 0;
    padding: var(--space-1);
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
  }
  .filter:disabled {
    opacity: 0.7;
  }
</style>
