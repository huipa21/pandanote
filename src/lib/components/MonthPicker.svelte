<script lang="ts">
  import { tick } from 'svelte';
  import Modal from './Modal.svelte';
  import {
    activityLevel,
    calendarYears,
    monthCells,
    monthLabel,
    type YearActivity,
  } from '#lib/shared/calendar.ts';
  import type { ApiResult } from '#lib/shared/domain.ts';

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

  let yearActivityData = $state<YearActivity | null>(null);
  let loading = $state(false);
  let activityError = $state('');
  let retry = $state(0);
  $effect(() => {
    if (open) {
      year = Number(month.slice(0, 4));
      choosingYear = false;
      error = '';
    }
  });
  $effect(() => {
    const targetYear = year;
    void retry;
    if (!open || choosingYear) return;
    const controller = new AbortController();
    let live = true;
    const timer = setTimeout(() => controller.abort(), 15_000);
    loading = true;
    activityError = '';
    yearActivityData = null;
    void fetch(`/api/calendar?year=${targetYear}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as ApiResult<YearActivity>;
        if (!live) return;
        if (!response.ok || !result.ok)
          throw new Error(
            result.ok ? 'Activity unavailable.' : result.error.message,
          );
        if (result.data.year !== targetYear)
          throw new Error('Unexpected calendar year.');
        yearActivityData = result.data;
      })
      .catch(() => {
        if (live) activityError = 'Year activity could not be loaded. Retry.';
      })
      .finally(() => {
        clearTimeout(timer);
        if (live) loading = false;
      });
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
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

  function monthCounts(targetMonth: string): number[] | undefined {
    if (!yearActivityData || yearActivityData.year !== year) return undefined;
    const found = yearActivityData.months.find((m) => m.month === targetMonth);
    return found?.counts;
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
          const next = Math.max(1969, year - (choosingYear ? 20 : 1));
          if (choosingYear) year = next;
          else void chooseYear(next);
        }}>‹</button
      >
      <button
        aria-label={choosingYear ? 'Next 20 years' : 'Next year'}
        disabled={choosingYear ? years.at(-1) === 9998 : year === 9998}
        onclick={() => {
          const next = Math.min(9998, year + (choosingYear ? 20 : 1));
          if (choosingYear) year = next;
          else void chooseYear(next);
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
    aria-busy={loading}
  >
    {#each months as value (value)}
      {@const key = `${year}-${String(value).padStart(2, '0')}`}
      {@const counts = monthCounts(key)}
      {@const cells = monthCells(key, yearActivityData?.weekStart ?? 1)}
      <a
        href={href(key)}
        aria-label={monthLabel(key)}
        aria-current={key === month ? 'date' : undefined}
        class="month-card"
        class:current={key === month}
        onclick={() => {
          open = false;
          onNavigate();
        }}
      >
        <div class="month-title">{monthLabel(key).split(' ')[0]}</div>
        <div class="mini-heatmap" aria-hidden="true">
          {#each cells as date, idx (`${key}-${idx}`)}
            {#if date}
              {@const dayNum = Number(date.slice(8))}
              {@const count = counts ? counts[dayNum - 1] : 0}
              <span
                class="mini-cell"
                data-date={date}
                data-level={counts === undefined ? 0 : activityLevel(count)}
              ></span>
            {:else}
              <span class="mini-cell empty"></span>
            {/if}
          {/each}
        </div>
      </a>
    {/each}
  </div>
  {#if !choosingYear}
    {#if loading}<p role="status">Loading year activity…</p>{/if}
    {#if activityError}<p role="alert">{activityError}</p>
      <button onclick={() => retry++}>Retry year activity</button>{/if}
  {/if}
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
  .month-card,
  .year-list button {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: var(--target);
    min-width: 0;
    padding: var(--space-2) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--page);
    color: var(--text);
    text-decoration: none;
    box-sizing: border-box;
  }
  .month-card {
    min-height: 5.5rem;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
    gap: 4px;
    justify-content: flex-start;
  }
  .month-title {
    font-weight: 600;
  }
  .mini-heatmap {
    display: grid;
    grid-template-columns: repeat(7, 6px);
    gap: 2px;
    justify-content: center;
    margin-top: 2px;
  }
  .mini-cell {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: var(--border);
  }
  .mini-cell.empty {
    visibility: hidden;
  }
  .mini-cell[data-level='1'] {
    background: var(--heat-1);
  }
  .mini-cell[data-level='2'] {
    background: var(--heat-2);
  }
  .mini-cell[data-level='3'] {
    background: var(--heat-3);
  }
  .mini-cell[data-level='4'] {
    background: var(--accent);
  }
  .month-card:hover,
  .year-list button:hover,
  .month-card.current,
  .year-list button.current {
    background: var(--accent-soft);
  }
  .month-card.current,
  .year-list button.current {
    border-color: var(--accent);
  }
  .month-card.current .month-title {
    color: var(--accent);
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
  @media (max-width: 480px) {
    .month-grid,
    .year-list {
      gap: var(--space-1);
    }
    .month-card {
      padding: var(--space-1);
      min-height: 4.5rem;
    }
    .mini-heatmap {
      grid-template-columns: repeat(7, 4px);
      gap: 1.5px;
    }
    .mini-cell {
      width: 4px;
      height: 4px;
    }
  }
</style>
