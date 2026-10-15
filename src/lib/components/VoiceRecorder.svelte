<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { formatClock } from '#lib/client/recording/recorder.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';

  /**
   * Recorder strip inside the editor container. All state lives in the workspace, so the
   * compact editor and the focus-mode dialog show the same take. The sr-only live region
   * stays mounted so start/pause/stop are announced to screen readers.
   */
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;

  let strip = $state<HTMLDivElement>();
  let announcement = $state('');
  const phase = $derived(workspace.recorder.state);
  const clock = $derived(formatClock(workspace.recorder.elapsedMs / 1000));
  // The meter is a coarse, non-animated level bar (no pulsing).
  const level = $derived(
    Math.round(Math.max(0, Math.min(1, workspace.recorder.level)) * 100),
  );

  let last = untrack(() => phase) as string;
  $effect(() => {
    const now = phase;
    untrack(() => {
      if (now === 'recording' && last === 'paused')
        announcement = t('rec.announceResumed');
      else if (now === 'recording' && last !== 'recording') {
        announcement = t('rec.announceStarted');
        // The microphone button is disabled while a take is open: focus Stop.
        void tick().then(() =>
          strip?.querySelector<HTMLElement>('[data-record-stop]')?.focus(),
        );
      } else if (now === 'paused') announcement = t('rec.announcePaused');
      last = now;
    });
  });
  /** After the strip closes, return focus to the microphone button. */
  async function refocus(container: Element | null | undefined) {
    await tick();
    container?.querySelector<HTMLElement>('[data-record-button]')?.focus();
  }
  async function stop() {
    const container = strip?.closest('.editor-container');
    const added = await workspace.stopRecording();
    if (added) announcement = t('rec.announceAdded');
    // A freshly added clip opens its name field, which takes the focus instead.
    if (!workspace.renamingId) await refocus(container);
  }
  async function cancel() {
    const container = strip?.closest('.editor-container');
    workspace.cancelRecording();
    announcement = t('rec.announceDiscarded');
    await refocus(container);
  }
</script>

<div class="sr-only" role="status" aria-live="polite">{announcement}</div>
{#if phase !== 'idle'}
  <div
    class="voice-strip"
    role="group"
    aria-label={t('rec.strip')}
    bind:this={strip}
    data-testid="voice-recorder"
    data-state={phase}
  >
    <span class="status">
      <span class="dot" class:live={phase === 'recording'} aria-hidden="true"
      ></span>
      <span class="label">
        {phase === 'starting'
          ? t('rec.waiting')
          : phase === 'paused'
            ? t('rec.paused')
            : t('rec.recording')}
      </span>
      <span class="clock" data-testid="voice-timer">{clock}</span>
    </span>
    <span
      class="meter"
      class:quiet={workspace.recorder.quiet}
      role="meter"
      aria-label={t('rec.level')}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={level}
    >
      <span class="fill" style:width="{phase === 'paused' ? 0 : level}%"></span>
    </span>
    {#if workspace.recorder.quiet}
      <p class="quiet-note" role="status" data-testid="voice-quiet">
        {t('rec.quiet')}
      </p>
    {/if}
    <span class="actions">
      {#if phase === 'paused'}
        <button type="button" onclick={() => workspace.resumeRecording()}
          >{t('rec.resume')}</button
        >
      {:else}
        <button
          type="button"
          disabled={phase !== 'recording'}
          onclick={() => workspace.pauseRecording()}>{t('rec.pause')}</button
        >
      {/if}
      <button
        type="button"
        class="primary"
        data-record-stop
        disabled={phase === 'starting'}
        onclick={stop}>{t('rec.stop')}</button
      >
      <button type="button" class="danger" onclick={cancel}
        >{t('rec.cancel')}</button
      >
    </span>
  </div>
{/if}

<style>
  .voice-strip {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin: var(--space-1) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    border: 2px solid var(--muted);
    background: transparent;
  }
  .dot.live {
    border-color: var(--danger);
    background: var(--danger);
  }
  .label {
    font-size: 0.875rem;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .meter {
    flex: 1 1 6rem;
    min-width: 5rem;
    height: 0.875rem;
    border-radius: 0.4375rem;
    overflow: hidden;
    border: 1px solid var(--control-border);
    background: var(--surface);
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 80ms linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
  .meter.quiet {
    border-color: var(--danger);
  }
  .quiet-note {
    flex: 1 1 100%;
    margin: 0;
    font-size: 0.875rem;
    color: var(--danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  @media (max-width: 480px) {
    .actions {
      flex: 1 1 100%;
    }
    .actions button {
      flex: 1 1 auto;
    }
  }
</style>
