<script lang="ts">
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
  $effect(() => {
    if (open) error = '';
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
<Modal bind:open title={t('date.title')}>
  <p>
    {t('date.help')}
  </p>
  {#if open && workspace.active}
    <label for={fieldId}
      >{t('date.label', { timezone: workspace.timezone })}</label
    >
    <DateTimeField
      id={fieldId}
      alwaysOpen
      ondone={() => (open = false)}
      value={timelineInput(workspace.active.timelineAt, workspace.timezone)}
      max={timelineInput(Date.now(), workspace.timezone)}
      disabled={workspace.busy || workspace.frozen || workspace.conflict}
      onchange={(next) => {
        try {
          workspace.updateMetadata({
            timelineAt: timelineInstant(next, workspace.timezone),
            location: workspace.active!.location,
          });
          error = '';
        } catch {
          error = t('date.invalid');
        }
      }}
    />
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</Modal>

<style>
  @media (max-width: 899px) and (max-height: 400px) {
    button {
      min-height: 2rem;
      padding-block: 0;
    }
  }
</style>
