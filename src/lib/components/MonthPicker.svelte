<script lang="ts">
  import { tick } from 'svelte';
  import { monthLabel } from '#lib/shared/calendar.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';

  let {
    month,
    href,
    onNavigate,
    onClose,
  }: {
    month: string;
    href: (month: string) => string;
    onNavigate: () => void;
    onClose: () => void;
  } = $props();
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;
  const monthNames: MessageKey[] = [
    'monthpicker.m1',
    'monthpicker.m2',
    'monthpicker.m3',
    'monthpicker.m4',
    'monthpicker.m5',
    'monthpicker.m6',
    'monthpicker.m7',
    'monthpicker.m8',
    'monthpicker.m9',
    'monthpicker.m10',
    'monthpicker.m11',
    'monthpicker.m12',
  ];
  const MIN_YEAR = 1969;
  const MAX_YEAR = 9998;
  // The browsed year is local; it never changes filters until a month is chosen.
  // svelte-ignore state_referenced_locally
  let year = $state(Number(month.slice(0, 4)));
  let editing = $state(false);
  let draft = $state('');
  let error = $state('');
  let panel = $state<HTMLDivElement>(null!);
  let yearButton = $state<HTMLButtonElement>(null!);
  let yearField = $state<HTMLInputElement>(null!);

  async function startEditing() {
    draft = String(year);
    error = '';
    editing = true;
    await tick();
    yearField?.focus();
    yearField?.select();
  }

  async function stopEditing() {
    editing = false;
    error = '';
    await tick();
    yearButton?.focus();
  }

  function commit(): boolean {
    const value = Number(draft.trim());
    if (
      !/^\d{1,4}$/.test(draft.trim()) ||
      value < MIN_YEAR ||
      value > MAX_YEAR
    ) {
      error = t('monthpicker.range', { min: MIN_YEAR, max: MAX_YEAR });
      return false;
    }
    year = value;
    error = '';
    return true;
  }

  async function submitYear() {
    if (commit()) await stopEditing();
    else yearField?.focus();
  }

  function onYearBlur() {
    if (!editing) return;
    if (commit()) editing = false;
    else {
      editing = false;
      error = '';
    }
  }

  function step(delta: number) {
    year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, year + delta));
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (editing) void stopEditing();
    else onClose();
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node | null;
    if (!panel || (target && panel.contains(target))) return;
    // Let the month heading button handle its own toggle.
    if (target instanceof Element && target.closest('[data-month-heading]'))
      return;
    onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerDown} />

<div
  bind:this={panel}
  class="month-picker"
  role="dialog"
  aria-label={t('monthpicker.dialog')}
>
  <div class="picker-heading">
    <button
      class="arrow"
      aria-label={t('monthpicker.prevYear')}
      disabled={year <= MIN_YEAR}
      onclick={() => step(-1)}>◀</button
    >
    {#if editing}
      <form
        class="year-form"
        onsubmit={(event) => {
          event.preventDefault();
          void submitYear();
        }}
      >
        <input
          bind:this={yearField}
          bind:value={draft}
          class="year-input"
          type="text"
          inputmode="numeric"
          maxlength="4"
          aria-label={t('monthpicker.year')}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onblur={onYearBlur}
        />
      </form>
    {:else}
      <button
        bind:this={yearButton}
        class="year-heading"
        aria-label={t('monthpicker.enterYear', { year })}
        data-initial-focus
        onclick={() => void startEditing()}>{year}</button
      >
    {/if}
    <button
      class="arrow"
      aria-label={t('monthpicker.nextYear')}
      disabled={year >= MAX_YEAR}
      onclick={() => step(1)}>▶</button
    >
  </div>
  {#if error}<p id={`${id}-error`} class="error" role="alert">{error}</p>{/if}
  <div class="month-grid" aria-label={t('monthpicker.months', { year })}>
    {#each monthNames as name, i (name)}
      {@const key = `${year}-${String(i + 1).padStart(2, '0')}`}
      <a
        href={href(key)}
        aria-label={monthLabel(key, i18n.locale)}
        aria-current={key === month ? 'date' : undefined}
        class="month-cell"
        class:current={key === month}
        onclick={() => {
          onClose();
          onNavigate();
        }}>{t(name)}</a
      >
    {/each}
  </div>
</div>

<style>
  .month-picker {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    z-index: 5;
    box-sizing: border-box;
    padding: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  }
  .picker-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .arrow {
    width: var(--target);
    min-height: var(--target);
    padding: 0;
    font-size: 0.875rem;
    color: var(--accent);
    border-color: transparent;
    background: transparent;
  }
  .year-heading {
    font-size: 1.125rem;
    font-weight: 700;
    min-height: var(--target);
    padding-inline: var(--space-2);
    border-color: transparent;
    background: transparent;
  }
  .year-form {
    display: flex;
    justify-content: center;
  }
  .year-input {
    width: 6ch;
    box-sizing: content-box;
    text-align: center;
    font-size: 1.125rem;
    font-weight: 700;
  }
  .error {
    margin: 0 0 var(--space-2);
    font-size: 0.8125rem;
    text-align: center;
  }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2px;
    flex: 1;
  }
  .month-cell {
    display: grid;
    place-items: center;
    min-height: var(--target);
    border-radius: 6px;
    color: var(--text);
    text-decoration: none;
    font-size: 0.9375rem;
  }
  .month-cell:hover {
    background: var(--accent-soft);
  }
  .month-cell.current {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }
</style>
