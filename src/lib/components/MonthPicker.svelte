<script lang="ts">
  import { tick } from 'svelte';
  import Modal from './Modal.svelte';
  import { calendarYears, monthLabel } from '#lib/shared/calendar.ts';

  let {
    open = $bindable(false),
    month,
    href,
    onNavigate,
  }: {
    open?: boolean;
    month: string;
    href: (month: string) => string;
    onNavigate: () => void;
  } = $props();
  const id = $props.id();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  let year = $state(2026);
  let choosingYear = $state(false);
  let yearInput = $state<number | undefined>();
  let error = $state('');
  let yearHeading = $state<HTMLButtonElement>(null!);
  let yearList = $state<HTMLDivElement>(null!);
  const years = $derived(calendarYears(year));

  $effect(() => {
    if (open) {
      year = Number(month.slice(0, 4));
      choosingYear = false;
      error = '';
    }
  });
  async function showYears() {
    yearInput = year;
    choosingYear = true;
    error = '';
    await tick();
    if (!open || !choosingYear) return;
    const selected = yearList?.querySelector<HTMLButtonElement>(
      `[data-year="${year}"]`,
    );
    selected?.scrollIntoView({ block: 'center' });
    selected?.focus({ preventScroll: true });
  }
  async function chooseYear(value: number | undefined) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1969 ||
      value > 9998
    ) {
      error = 'Choose a year between 1969 and 9998.';
      return;
    }
    year = value;
    choosingYear = false;
    error = '';
    await tick();
    if (open) yearHeading?.focus();
  }
</script>

<Modal bind:open title="Choose year and month" customHeader>
  <div class="picker-heading">
    <button
      bind:this={yearHeading}
      class="year-heading"
      aria-label={choosingYear
        ? `Show months in ${year}`
        : `Choose year, ${year}`}
      aria-expanded={choosingYear}
      aria-controls={`${id}-years`}
      data-initial-focus
      onclick={() => {
        if (choosingYear) void chooseYear(year);
        else void showYears();
      }}>{choosingYear ? `${years[0]}–${years.at(-1)}` : year}</button
    >
    <div class="year-arrows">
      <button
        aria-label={choosingYear ? 'Previous 20 years' : 'Previous year'}
        disabled={choosingYear ? years[0] === 1969 : year === 1969}
        onclick={() => {
          year = Math.max(1969, year - (choosingYear ? 20 : 1));
        }}>‹</button
      >
      <button
        aria-label={choosingYear ? 'Next 20 years' : 'Next year'}
        disabled={choosingYear ? years.at(-1) === 9998 : year === 9998}
        onclick={() => {
          year = Math.min(9998, year + (choosingYear ? 20 : 1));
        }}>›</button
      >
      <button
        aria-label="Close Choose year and month"
        onclick={() => (open = false)}>×</button
      >
    </div>
  </div>
  <div id={`${id}-years`} hidden={!choosingYear}>
    <p class="help">
      Scroll to a year, browse with the arrows, or jump directly.
    </p>
    <div bind:this={yearList} class="year-list" aria-label="Years">
      {#each years as value (value)}
        <button
          data-year={value}
          class:current={value === year}
          aria-pressed={value === year}
          onclick={() => void chooseYear(value)}>{value}</button
        >
      {/each}
    </div>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void chooseYear(yearInput);
      }}
    >
      <label for={`${id}-year`}>Jump to year</label>
      <div class="year-jump">
        <input
          id={`${id}-year`}
          type="number"
          min="1969"
          max="9998"
          step="1"
          bind:value={yearInput}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="submit">Show months</button>
      </div>
    </form>
    {#if error}<p id={`${id}-error`} role="alert">{error}</p>{/if}
  </div>
  <div
    class="month-grid"
    hidden={choosingYear}
    aria-label={`Months in ${year}`}
  >
    {#each months as value (value)}
      {@const key = `${year}-${String(value).padStart(2, '0')}`}
      <a
        href={href(key)}
        aria-label={monthLabel(key)}
        aria-current={key === month ? 'date' : undefined}
        class:current={key === month}
        onclick={() => {
          open = false;
          onNavigate();
        }}>{monthLabel(key).split(' ')[0]}</a
      >
    {/each}
  </div>
</Modal>

<style>
  .picker-heading,
  .year-arrows,
  .year-jump {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .picker-heading {
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .picker-heading button {
    border-color: transparent;
    background: transparent;
  }
  .year-heading {
    font-weight: 700;
    padding-inline: var(--space-1);
  }
  .year-arrows {
    gap: 0;
  }
  .year-arrows button {
    width: var(--target);
    padding: 0;
    font-size: 1.5rem;
  }
  .month-grid,
  .year-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
  }
  [hidden] {
    display: none;
  }
  .month-grid a,
  .year-list button {
    display: grid;
    place-items: center;
    min-height: var(--target);
    min-width: 0;
    padding: var(--space-2) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--page);
    color: var(--text);
    text-decoration: none;
  }
  .month-grid a {
    min-height: 4rem;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
  .month-grid a:hover,
  .year-list button:hover,
  .month-grid a.current,
  .year-list button.current {
    background: var(--accent-soft);
  }
  .month-grid a.current,
  .year-list button.current {
    border-color: var(--accent);
    font-weight: 700;
  }
  .year-list {
    max-height: 10rem;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--space-1);
    margin-bottom: var(--space-3);
  }
  .year-jump {
    margin-top: var(--space-1);
  }
  .year-jump input {
    min-width: 0;
    width: 8rem;
  }
  .year-jump button {
    flex: none;
  }
  @media (max-width: 399px) {
    .month-grid,
    .year-list {
      gap: var(--space-1);
    }
  }
</style>
