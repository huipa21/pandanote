<script lang="ts">
  import { onMount } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import TimelineOptions from './TimelineOptions.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { RECORDER_ERROR_KEYS } from '#lib/client/recording/clips.ts';
  import type { RecorderErrorCode } from '#lib/client/recording/recorder.ts';
  const i18n = useI18n();
  const t = i18n.t;

  let {
    workspace,
    onTag,
    onFiles,
  }: {
    workspace: EditorWorkspace | undefined;
    onTag: () => void;
    onFiles: () => void;
  } = $props();
  let dateOpen = $state(false);
  // Browser capability is only known on the client (secure context, MediaRecorder).
  let unsupported = $state<RecorderErrorCode | null>(null);
  onMount(() => {
    unsupported = workspace?.recordingUnsupported ?? null;
  });
  const recordTitle = $derived(
    unsupported ? t(RECORDER_ERROR_KEYS[unsupported]) : t('rec.startTitle'),
  );
  const when = $derived(
    workspace?.active
      ? new Date(workspace.active.timelineAt).toLocaleString(i18n.locale, {
          timeZone: workspace.timezone,
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '',
  );
  let locked = $derived(
    !workspace?.ready ||
      workspace.busy ||
      workspace.conflict ||
      workspace.frozen,
  );
</script>

<div class="note-options" role="group" aria-label={t('editor.options')}>
  <button
    type="button"
    disabled={locked}
    aria-label={t('editor.addTag')}
    title={t('editor.tags')}
    onclick={onTag}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17" /></svg
    >
  </button>
  <button
    type="button"
    disabled={locked}
    aria-label={t('editor.addMedia')}
    title={t('editor.mediaTitle')}
    onclick={onFiles}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="3" y="4" width="18" height="16" rx="2" /><circle
        cx="9"
        cy="10"
        r="1.5"
      /><path d="m21 16-5-5-9 9" /></svg
    >
  </button>
  <button
    type="button"
    data-record-button
    disabled={locked || Boolean(unsupported) || workspace?.recording}
    aria-label={t('rec.start')}
    title={recordTitle}
    onclick={() => void workspace?.startRecording()}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="9" y="3" width="6" height="11" rx="3" /><path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
      /></svg
    >
  </button>
  <button
    type="button"
    disabled={locked}
    aria-label={t('editor.setDate')}
    title={t('editor.dateTitle')}
    onclick={() => (dateOpen = true)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="3" y="5" width="18" height="16" rx="2" /><path
        d="M3 10h18M8 3v4m8-4v4"
      /></svg
    >
  </button>
  {#if workspace?.active && (workspace.timelineSet || workspace.active.kind === 'edit')}
    <time
      class="date-chip"
      datetime={new Date(workspace.active.timelineAt).toISOString()}
      title={t('date.chip', { when })}>{when}</time
    >
  {/if}
</div>
{#if workspace}
  <TimelineOptions {workspace} bind:open={dateOpen} showTrigger={false} />
{/if}

<style>
  .note-options {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .note-options button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--target);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
  }
  .date-chip {
    padding-inline: var(--space-2);
    color: var(--muted);
    font-size: 0.875rem;
    white-space: nowrap;
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
