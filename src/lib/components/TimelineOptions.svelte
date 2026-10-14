<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import DateTimeField from './DateTimeField.svelte';
  import { timelineInput, timelineInstant } from '#lib/client/uploads/date.ts';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let {
    workspace,
    open = $bindable(false),
    showTrigger = true,
  }: {
    workspace: EditorWorkspace;
    open?: boolean;
    showTrigger?: boolean;
  } = $props();
  const fieldId = $props.id();
  const t = useI18n().t;
  let error = $state('');
  let draft = $state<string | null>(null);
  const locked = $derived(
    !workspace.active ||
      workspace.busy ||
      workspace.frozen ||
      workspace.conflict,
  );
  function check(next: string) {
    draft = next;
    try {
      timelineInstant(next, workspace.timezone);
      error = '';
    } catch {
      error = t('date.invalid');
    }
  }
  function save() {
    try {
      workspace.updateMetadata({
        timelineAt: timelineInstant(draft ?? '', workspace.timezone),
      });
      error = '';
      open = false;
    } catch {
      error = t('date.invalid');
    }
  }
  $effect(() => {
    if (!open) draft = null;
    else {
      error = '';
      // Edit a draft; nothing changes until Save.
      draft = untrack(() =>
        workspace.active
          ? timelineInput(workspace.active.timelineAt, workspace.timezone)
          : '',
      );
    }
  });
</script>

{#if showTrigger}<button
    disabled={!workspace.active ||
      workspace.busy ||
      workspace.frozen ||
      workspace.conflict}
    onclick={() => {
      open = true;
      error = '';
    }}>{t('date.button')}</button
  >{/if}
<Modal bind:open title={t('date.title')} customHeader lightDismiss>
  {#if open && workspace.active && draft !== null}
    <!-- Visually hidden: the calendar and text bar are the only visible controls. -->
    <label class="sr-only" for={fieldId}
      >{t('date.label', { timezone: workspace.timezone })}</label
    >
    <DateTimeField
      id={fieldId}
      alwaysOpen
      calendarOnly
      value={draft ?? ''}
      max={timelineInput(Date.now(), workspace.timezone)}
      disabled={locked}
      onchange={check}
    />
    <button
      type="button"
      class="primary save"
      disabled={locked || Boolean(error) || !draft}
      onclick={save}>{t('date.save')}</button
    >
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</Modal>

<style>
  .save {
    margin-top: var(--space-3);
    width: min(20rem, 100%);
  }
  @media (max-width: 899px) and (max-height: 400px) {
    button {
      min-height: 2rem;
      padding-block: 0;
    }
  }
</style>
