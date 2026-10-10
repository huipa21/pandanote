<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import {
    activityLevel,
    monthCells,
    monthLabel,
    shiftMonth,
  } from '#lib/shared/calendar.ts';
  import { filterHref, type TimelineFilters } from '#lib/shared/timeline.ts';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  let {
    calendar,
    filters,
    onNavigate = () => {},
  }: {
    calendar: CalendarState;
    filters: TimelineFilters;
    onNavigate?: () => void;
  } = $props();
  const id = $props.id();
  let ready = $state(false);
  let picker = $state(false);
  let year = $state(2026);
  let month = $state(1);
  onMount(() => {
    ready = true;
  });
  const activity = $derived(calendar.activity);
  const cells = $derived(monthCells(calendar.month, activity?.weekStart ?? 1));
  const weekdays = $derived(
    (activity?.weekStart ?? 1) === 1
      ? [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ]
      : [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ],
  );
  const currentCounts = $derived(
    activity?.month === calendar.month && !calendar.loading && !calendar.error,
  );
  function jump(value: string) {
    return filterHref({
      tags: filters.tags,
      query: filters.query,
      month: value,
    });
  }
  function dayHref(date: string) {
    return filterHref({
      tags: filters.tags,
      query: filters.query,
      ...(filters.date === date ? {} : { date }),
    });
  }
</script>

<div class="calendar" data-calendar-month={calendar.month}>
  <div class="calendar-heading">
    <button
      disabled={!ready}
      aria-haspopup="dialog"
      onclick={() => {
        year = Number(calendar.month.slice(0, 4));
        month = Number(calendar.month.slice(5));
        picker = true;
      }}>{monthLabel(calendar.month)}</button
    >
    <div class="month-arrows">
      <a
        aria-label="Previous month"
        aria-disabled={calendar.month === '1969-01'}
        href={calendar.month === '1969-01'
          ? undefined
          : jump(shiftMonth(calendar.month, -1))}
        onclick={onNavigate}>‹</a
      >
      <a
        aria-label="Next month"
        aria-disabled={calendar.month === '9998-12'}
        href={calendar.month === '9998-12'
          ? undefined
          : jump(shiftMonth(calendar.month, 1))}
        onclick={onNavigate}>›</a
      >
    </div>
  </div>
  <table
    aria-label={`Activity in ${monthLabel(calendar.month)}`}
    aria-busy={calendar.loading}
  >
    <thead
      ><tr
        >{#each weekdays as day (day)}<th scope="col"
            ><abbr title={day}>{day.slice(0, 3)}</abbr></th
          >{/each}</tr
      ></thead
    >
    <tbody
      >{#each Array.from({ length: cells.length / 7 }, (_, i) => i) as row (row)}<tr
        >
          {#each cells.slice(row * 7, row * 7 + 7) as date, col (col)}<td>
              {#if date}{@const count = currentCounts
                  ? activity!.counts[Number(date.slice(8)) - 1]
                  : undefined}
                <a
                  href={dayHref(date)}
                  onclick={onNavigate}
                  class:today={date === activity?.today}
                  class:selected={date === filters.date}
                  data-level={count === undefined ? 0 : activityLevel(count)}
                  data-date={date}
                  aria-current={date === activity?.today ? 'date' : undefined}
                  aria-label={`${date}: ${count === undefined ? 'activity unavailable' : `${count} published ${count === 1 ? 'note' : 'notes'}`}${date === activity?.today ? ', today' : ''}${date === filters.date ? ', selected; clear day filter' : ''}`}
                  >{Number(date.slice(8))}</a
                >
              {/if}
            </td>{/each}
        </tr>{/each}</tbody
    >
  </table>
  <div class="calendar-footer">
    <a
      href={jump((activity?.today ?? calendar.month).slice(0, 7))}
      onclick={onNavigate}>Today</a
    ><span class="help">{activity?.timezone ?? 'UTC'}</span>
  </div>
  {#if calendar.loading}<p class="help" role="status">
      Loading activity…
    </p>{:else if calendar.error}<p class="help" role="alert">
      {calendar.error}
    </p>
    <button onclick={() => calendar.refresh()}>Retry activity</button>{/if}
  <p class="help legend">All published notes · darker means more</p>
</div>
<Modal bind:open={picker} title="Choose year and month">
  <label for={`${id}-year`}>Year</label><input
    id={`${id}-year`}
    type="number"
    min="1969"
    max="9998"
    bind:value={year}
    data-initial-focus
  />
  <label for={`${id}-month`}>Month</label><select
    id={`${id}-month`}
    bind:value={month}
    >{#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<option
        value={m}
        >{monthLabel(`2026-${String(m).padStart(2, '0')}`).split(
          ' ',
        )[0]}</option
      >{/each}</select
  >
  {#if Number.isInteger(year) && year >= 1969 && year <= 9998}<a
      class="picker-go"
      href={jump(`${year}-${String(month).padStart(2, '0')}`)}
      onclick={() => {
        picker = false;
        onNavigate();
      }}>Go to month</a
    >{:else}<p role="alert">Choose a year between 1969 and 9998.</p>{/if}
</Modal>

<style>
  .calendar-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
  }
  .calendar-heading button {
    padding: 4px;
    min-width: 0;
    text-align: left;
    font-size: 0.875rem;
    border-color: transparent;
    background: transparent;
  }
  .month-arrows {
    display: flex;
    flex: none;
  }
  .month-arrows a {
    display: grid;
    place-items: center;
    width: 32px;
    min-height: var(--target);
    font-size: 1.5rem;
    text-decoration: none;
  }
  table {
    table-layout: fixed;
    width: 100%;
    border-spacing: 2px;
  }
  th {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 400;
  }
  abbr {
    text-decoration: none;
  }
  td {
    padding: 0;
    text-align: center;
  }
  td a {
    display: grid;
    place-items: center;
    min-height: 32px;
    border-radius: 5px;
    text-decoration: none;
    color: var(--text);
    background: var(--surface);
    font-size: 0.8125rem;
    position: relative;
  }
  td a[data-level='1'] {
    background: var(--heat-1);
  }
  td a[data-level='2'] {
    background: var(--heat-2);
  }
  td a[data-level='3'] {
    background: var(--heat-3);
    color: var(--on-accent);
  }
  td a[data-level='4'] {
    background: var(--accent);
    color: var(--on-accent);
  }
  td a.selected {
    outline: 2px solid var(--text);
    outline-offset: 0;
  }
  td a.today::after {
    content: '';
    position: absolute;
    bottom: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
  .calendar-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }
  .calendar-footer a,
  .picker-go {
    display: inline-flex;
    align-items: center;
    min-height: var(--target);
  }
  .calendar-footer span {
    overflow-wrap: anywhere;
    text-align: right;
  }
  .legend {
    margin: 0;
    font-size: 0.6875rem;
  }
  @media (max-width: 899px) {
    td a {
      min-height: var(--target);
    }
    .month-arrows a {
      width: var(--target);
    }
  }
</style>
