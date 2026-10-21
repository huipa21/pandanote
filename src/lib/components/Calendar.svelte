<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MonthPicker from './MonthPicker.svelte';
  import {
    activityLevel,
    monthCells,
    monthLabel,
    shiftMonth,
  } from '#lib/shared/calendar.ts';
  import { filterHref, type TimelineFilters } from '#lib/shared/timeline.ts';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let {
    calendar,
    filters,
    onNavigate = () => {},
  }: {
    calendar: CalendarState;
    filters: TimelineFilters;
    onNavigate?: () => void;
  } = $props();
  let ready = $state(false);
  const i18n = useI18n();
  const t = i18n.t;
  let picker = $state(false);
  let heading = $state<HTMLButtonElement>(null!);
  async function closePicker() {
    picker = false;
    await tick();
    heading?.focus();
  }
  onMount(() => {
    ready = true;
  });
  const activity = $derived(calendar.activity);
  const cells = $derived(monthCells(calendar.month, activity?.weekStart ?? 1));
  const weekdays = $derived(
    (activity?.weekStart ?? 1) === 1
      ? [
          t('calendar.monday'),
          t('calendar.tuesday'),
          t('calendar.wednesday'),
          t('calendar.thursday'),
          t('calendar.friday'),
          t('calendar.saturday'),
          t('calendar.sunday'),
        ]
      : [
          t('calendar.sunday'),
          t('calendar.monday'),
          t('calendar.tuesday'),
          t('calendar.wednesday'),
          t('calendar.thursday'),
          t('calendar.friday'),
          t('calendar.saturday'),
        ],
  );
  const currentCounts = $derived(
    activity?.month === calendar.month && !calendar.loading && !calendar.error,
  );
  function jump(value: string) {
    return filterHref({
      tag: filters.tag,
      query: filters.query,
      month: value,
    });
  }
  function dayHref(date: string) {
    return filterHref({
      tag: filters.tag,
      query: filters.query,
      ...(filters.date === date ? {} : { date }),
    });
  }
</script>

<div class="calendar" data-calendar-month={calendar.month}>
  <div class="calendar-heading">
    <button
      bind:this={heading}
      data-month-heading
      disabled={!ready}
      aria-haspopup="dialog"
      aria-expanded={picker}
      onclick={() => {
        picker = !picker;
      }}>{monthLabel(calendar.month, i18n.locale)}</button
    >
    <div class="month-arrows">
      <a
        aria-label={t('calendar.previousMonth')}
        aria-disabled={calendar.month === '1969-01'}
        href={calendar.month === '1969-01'
          ? undefined
          : jump(shiftMonth(calendar.month, -1))}
        onclick={onNavigate}>‹</a
      >
      <a
        class="today-link"
        href={jump((activity?.today ?? calendar.month).slice(0, 7))}
        onclick={onNavigate}>{t('calendar.today')}</a
      >
      <a
        aria-label={t('calendar.nextMonth')}
        aria-disabled={calendar.month === '9998-12'}
        href={calendar.month === '9998-12'
          ? undefined
          : jump(shiftMonth(calendar.month, 1))}
        onclick={onNavigate}>›</a
      >
    </div>
  </div>
  {#if picker}
    <MonthPicker
      month={calendar.month}
      href={jump}
      {onNavigate}
      onClose={() => void closePicker()}
    />
  {/if}
  <table
    aria-label={t('calendar.activityIn', {
      month: monthLabel(calendar.month, i18n.locale),
    })}
    aria-busy={calendar.loading}
  >
    <thead
      ><tr
        >{#each weekdays as day (day)}<th scope="col"
            ><abbr title={day}
              ><span class="weekday-full">{day.slice(0, 3)}</span><span
                class="weekday-compact"
                >{i18n.language === 'zh-CN'
                  ? day.slice(-1)
                  : day.slice(0, 3)}</span
              ></abbr
            ></th
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
                  aria-label={`${date}: ${count === undefined ? t('calendar.unavailable') : count === 1 ? t('calendar.publishedOne', { count }) : t('calendar.publishedMany', { count })}${date === activity?.today ? t('calendar.todaySuffix') : ''}${date === filters.date ? t('calendar.selectedSuffix') : ''}`}
                  ><span class="date-number">{Number(date.slice(8))}</span></a
                >
              {/if}
            </td>{/each}
        </tr>{/each}</tbody
    >
  </table>
  {#if calendar.loading}<p class="help" role="status">
      {t('calendar.loading')}
    </p>{:else if calendar.error}<p class="help" role="alert">
      {calendar.error}
    </p>
    <button onclick={() => calendar.refresh()}>{t('calendar.retry')}</button
    >{/if}
</div>

<style>
  .calendar {
    position: relative;
    container-type: inline-size;
  }
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
    font-weight: 700;
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
    white-space: nowrap;
  }
  .weekday-compact {
    display: none;
  }
  @container (max-width: 280px) {
    .weekday-full {
      display: none;
    }
    .weekday-compact {
      display: inline;
    }
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
    background: transparent;
    font-size: 0.8125rem;
    position: relative;
  }
  .date-number {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    background: var(--page);
  }
  td a[data-level='1'] .date-number {
    background: var(--heat-1);
  }
  td a[data-level='2'] .date-number {
    background: var(--heat-2);
  }
  td a[data-level='3'] .date-number {
    background: var(--heat-3);
    color: var(--on-accent);
  }
  td a[data-level='4'] .date-number {
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
    bottom: 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
  .month-arrows .today-link {
    width: auto;
    padding-inline: 6px;
    font-size: 0.8125rem;
  }
  @media (max-width: 899px) {
    td a {
      min-height: var(--target);
    }
    .date-number {
      width: 32px;
      height: 32px;
    }
    .month-arrows a:not(.today-link) {
      width: var(--target);
    }
  }
</style>
