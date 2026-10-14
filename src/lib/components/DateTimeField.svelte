<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { monthCells, monthLabel, shiftMonth } from '#lib/shared/calendar.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let {
    id,
    value,
    max,
    disabled = false,
    alwaysOpen = false,
    /** With alwaysOpen: show only the calendar (no time fields or Done). */
    calendarOnly = false,
    ondone,
    onchange,
  }: {
    id: string;
    /** Local date-time `YYYY-MM-DDTHH:mm:ss` in the app timezone. */
    value: string;
    /** Latest selectable local date-time; later days are disabled. */
    max: string;
    disabled?: boolean;
    /** Show the themed picker immediately, without the toggle button. */
    alwaysOpen?: boolean;
    calendarOnly?: boolean;
    /** Called by Done; defaults to collapsing the picker. */
    ondone?: () => void;
    onchange: (value: string) => void;
  } = $props();
  const i18n = useI18n();
  const t = i18n.t;
  const weekdays = $derived([
    t('picker.mon'),
    t('picker.tue'),
    t('picker.wed'),
    t('picker.thu'),
    t('picker.fri'),
    t('picker.sat'),
    t('picker.sun'),
  ]);
  const startMonth = () => {
    const day = untrack(() => value.slice(0, 10));
    // A future (or unsupported) day opens on the latest selectable month.
    return /^\d{4}-\d{2}/.test(day) && day <= untrack(() => max).slice(0, 10)
      ? day.slice(0, 7)
      : untrack(() => max).slice(0, 7);
  };
  let open = $state(untrack(() => alwaysOpen));
  let current = $derived(value);
  let month = $state(untrack(() => (alwaysOpen ? startMonth() : '')));
  let trigger = $state<HTMLButtonElement>(null!);
  let panel = $state<HTMLDivElement>(null!);
  const date = $derived(current.slice(0, 10));
  const time = $derived(
    (current.slice(11, 19) || '00:00:00')
      .split(':')
      .map((part) => Number(part) || 0),
  );
  const cells = $derived(month ? monthCells(month, 1) : []);
  function commit(next: string) {
    current = next;
    onchange(next);
  }
  function pad(part: number) {
    return String(part).padStart(2, '0');
  }
  function setTime(index: number, limit: number, raw: string) {
    const parts = [...time];
    parts[index] = Math.min(limit, Math.max(0, Math.trunc(Number(raw) || 0)));
    commit(`${date}T${parts.map(pad).join(':')}`);
  }
  function go(amount: number) {
    try {
      month = shiftMonth(month, amount);
    } catch {
      // Outside the supported calendar range: stay on the current month.
    }
  }
  async function toggle() {
    open = !open;
    if (!open) return;
    month = startMonth();
    await tick();
    panel
      ?.querySelector<HTMLElement>(
        '[aria-pressed="true"], button:not(:disabled)',
      )
      ?.focus();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open || alwaysOpen) return;
    // Close only the picker; the surrounding dialog stays open.
    event.preventDefault();
    event.stopPropagation();
    open = false;
    trigger.focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (Escape handling for the popup; its controls are focusable.) -->
<div class="field" class:compact={calendarOnly} onkeydown={keydown}>
  <div class="row">
    <input
      {id}
      type="datetime-local"
      step="1"
      {value}
      {disabled}
      onchange={(event) => {
        current = event.currentTarget.value;
        onchange(event.currentTarget.value);
      }}
    />
    {#if !alwaysOpen}<button
        type="button"
        class="toggle"
        aria-label={t('picker.choose')}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        {disabled}
        bind:this={trigger}
        onclick={toggle}>▾</button
      >{/if}
  </div>
  {#if open}
    <div
      class="panel"
      id={`${id}-panel`}
      role="group"
      aria-label={t('picker.panel')}
      bind:this={panel}
    >
      <div class="month">
        <button
          type="button"
          aria-label={t('picker.prevMonth')}
          onclick={() => go(-1)}>‹</button
        >
        <strong aria-live="polite">{monthLabel(month, i18n.locale)}</strong>
        <button
          type="button"
          aria-label={t('picker.nextMonth')}
          onclick={() => go(1)}>›</button
        >
      </div>
      <div
        class="grid"
        role="group"
        aria-label={monthLabel(month, i18n.locale)}
      >
        {#each weekdays as day (day)}<span class="weekday" aria-hidden="true"
            >{day}</span
          >{/each}
        {#each cells as cell, index (index)}
          {#if cell}
            <button
              type="button"
              class="day"
              aria-label={cell}
              aria-pressed={cell === date}
              data-initial-focus={cell === date || undefined}
              disabled={cell > max.slice(0, 10)}
              onclick={() => commit(`${cell}T${time.map(pad).join(':')}`)}
              >{Number(cell.slice(8))}</button
            >
          {:else}<span></span>{/if}
        {/each}
      </div>
      {#if !calendarOnly}<div class="time">
          <label
            >{t('picker.hour')}
            <input
              type="number"
              min="0"
              max="23"
              value={pad(time[0]!)}
              onchange={(event) => setTime(0, 23, event.currentTarget.value)}
            /></label
          >
          <label
            >{t('picker.minute')}
            <input
              type="number"
              min="0"
              max="59"
              value={pad(time[1]!)}
              onchange={(event) => setTime(1, 59, event.currentTarget.value)}
            /></label
          >
          <label
            >{t('picker.second')}
            <input
              type="number"
              min="0"
              max="59"
              value={pad(time[2]!)}
              onchange={(event) => setTime(2, 59, event.currentTarget.value)}
            /></label
          >
        </div>{/if}
      {#if !calendarOnly}<button
          type="button"
          class="primary done"
          onclick={() => {
            if (ondone) return ondone();
            open = false;
            trigger?.focus();
          }}>{t('picker.done')}</button
        >{/if}
    </div>
  {/if}
</div>

<style>
  .field {
    display: block;
    margin-top: var(--space-1);
  }
  /* Calendar-only popup: text bar and calendar share one width. */
  .field.compact {
    width: min(20rem, 100%);
  }
  .field.compact .panel {
    max-width: none;
    box-sizing: border-box;
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  /* The native popup cannot follow the design tokens; the themed panel replaces it. */
  input[type='datetime-local']::-webkit-calendar-picker-indicator {
    display: none;
  }
  .toggle {
    flex: none;
    min-width: var(--target);
    padding-inline: var(--space-2);
  }
  .panel {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-width: 20rem;
  }
  .month {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .month button {
    min-width: var(--row-target);
    min-height: var(--row-target);
    padding: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-1);
    text-align: center;
  }
  .weekday {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .day {
    min-height: var(--row-target);
    padding: 0;
    border-color: transparent;
    background: none;
  }
  .day:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .day:disabled {
    color: var(--muted);
    opacity: 0.5;
  }
  .day[aria-pressed='true'],
  .day[aria-pressed='true']:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    font-weight: 650;
  }
  .time {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .time label {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    color: var(--muted);
  }
  .time input {
    width: 100%;
    color: var(--text);
  }
  .done {
    margin-top: var(--space-3);
    width: 100%;
  }
</style>
