<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    calendarPreferencesSchema,
    type CalendarPreferences,
  } from '#lib/shared/calendar.ts';
  let { initial }: { initial: CalendarPreferences } = $props();
  let timezone = $state(untrack(() => initial.timezone));
  let weekStart = $state<0 | 1>(untrack(() => initial.weekStart));
  let detected = $state('');
  let zones = $state([
    'UTC',
    'Asia/Hong_Kong',
    'Asia/Tokyo',
    'America/New_York',
    'Europe/London',
    'Pacific/Auckland',
  ]);
  let ready = $state(false);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;
  onMount(() => {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof Intl.supportedValuesOf === 'function')
      zones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
    ready = true;
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    message = '';
    error = '';
    if (!calendarPreferencesSchema.safeParse({ timezone, weekStart }).success) {
      error = t('calset.invalid');
      return;
    }
    saving = true;
    try {
      const response = await fetch('/api/settings/calendar', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone, weekStart }),
      });
      const result = await response.json();
      if (!result.ok)
        throw new Error(
          result.error ? i18n.error(result.error) : t('calset.failed'),
        );
      await invalidateAll();
      message = t('calset.saved');
    } catch (failure) {
      error = failure instanceof Error ? failure.message : t('calset.network');
    } finally {
      saving = false;
    }
  }
</script>

<section class="surface">
  <h2>{t('settings.tabCalendar')}</h2>
  <p class="help">
    {t('calset.help')}
  </p>
  <form onsubmit={save}>
    <fieldset disabled={!ready || saving}>
      <label for={`${id}-timezone`}>{t('calset.timezone')}</label><input
        id={`${id}-timezone`}
        bind:value={timezone}
        list={`${id}-zones`}
        maxlength="100"
        placeholder="Asia/Hong_Kong"
      />
      <datalist id={`${id}-zones`}
        >{#each zones as zone (zone)}<option value={zone}
          ></option>{/each}</datalist
      >
      {#if detected}<button
          type="button"
          onclick={() => {
            timezone = detected;
          }}>{t('calset.useBrowser', { zone: detected })}</button
        >{/if}
      <label for={`${id}-week`}>{t('calset.weekStart')}</label><select
        id={`${id}-week`}
        bind:value={weekStart}
        ><option value={1}>{t('calendar.monday')}</option><option value={0}
          >{t('calendar.sunday')}</option
        ></select
      >
      <button class="primary" type="submit"
        >{saving ? t('calset.saving') : t('calset.save')}</button
      >
    </fieldset>
  </form>
  {#if message}<p role="status">{message}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  input,
  select {
    width: min(100%, 22rem);
  }
</style>
