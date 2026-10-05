<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import {
    calendarPreferencesSchema,
    type CalendarPreferences,
  } from '#lib/shared/calendar.ts';
  let { initial }: { initial: CalendarPreferences } = $props();
  let timezone = $state(untrack(() => initial.timezone));
  let weekStart = $state<0 | 1>(untrack(() => initial.weekStart));
  let detected = $state('');
  let ready = $state(false);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');
  const id = $props.id();
  onMount(() => {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    ready = true;
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    message = '';
    error = '';
    if (!calendarPreferencesSchema.safeParse({ timezone, weekStart }).success) {
      error = 'Enter a valid IANA timezone, such as Asia/Hong_Kong.';
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
          result.error?.message ?? 'Could not save calendar settings.',
        );
      await invalidateAll();
      message = 'Calendar saved. Dates and counts now use this timezone.';
    } catch (failure) {
      error =
        failure instanceof Error
          ? failure.message
          : 'Could not save calendar settings. Your choices remain; retry.';
    } finally {
      saving = false;
    }
  }
</script>

<section class="surface">
  <h2>Calendar</h2>
  <p class="help">
    One saved app timezone groups note dates on every device. Travelling or
    changing the browser/VPS timezone will not change it. New notebooks use UTC
    until you choose.
  </p>
  <form onsubmit={save}>
    <fieldset disabled={!ready || saving}>
      <label for={`${id}-timezone`}>App timezone</label><input
        id={`${id}-timezone`}
        bind:value={timezone}
        list={`${id}-zones`}
        maxlength="100"
        placeholder="Asia/Hong_Kong"
      />
      <datalist id={`${id}-zones`}
        >{#each ['UTC', 'Asia/Hong_Kong', 'Asia/Tokyo', 'America/New_York', 'Europe/London', 'Pacific/Auckland'] as zone (zone)}<option
            value={zone}
          ></option>{/each}</datalist
      >
      {#if detected}<button
          type="button"
          onclick={() => {
            timezone = detected;
          }}>Use browser timezone ({detected})</button
        >{/if}
      <label for={`${id}-week`}>Week starts on</label><select
        id={`${id}-week`}
        bind:value={weekStart}
        ><option value={1}>Monday</option><option value={0}>Sunday</option
        ></select
      >
      <button class="primary" type="submit"
        >{saving ? 'Saving calendar…' : 'Save calendar'}</button
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
