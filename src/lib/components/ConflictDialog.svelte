<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const i18n = useI18n();
  const t = i18n.t;
  let open = $state(false);
  let confirm = $state(false);
  let observed = $state<NoteSnapshot | null>(null);
  let choice = $state<'load' | 'copy' | 'replace'>('load');
  $effect(() => {
    const note = workspace.postConflict;
    untrack(() => {
      if (note) {
        observed = note;
        confirm = false;
        open = true;
      } else {
        open = false;
        confirm = false;
      }
    });
  });
  function choose(value: typeof choice) {
    choice = value;
    confirm = true;
  }
  async function resolve() {
    if (!observed) return;
    const version = observed;
    confirm = false;
    open = false;
    if (choice === 'load' && version.status === 'trash') {
      await goto(`/notes/${version.id}`, { reset: false });
      return;
    }
    await workspace.resolveServerConflict(choice, version);
  }
</script>

<Modal bind:open title={t('conflict.title')} dismissible={!workspace.busy}>
  <p>
    {t('conflict.help')}
  </p>
  {#if observed}
    <h3>
      {t('conflict.serverVersion', {
        revision: observed.revision,
        status: observed.status,
      })}
    </h3>
    <p>
      {t('conflict.timeline', {
        time: new Date(observed.timelineAt).toLocaleString(i18n.locale, {
          timeZone: workspace.timezone,
        }),
      })}
    </p>
    <pre>{observed.bodyMarkdown}</pre>
    <ul>
      {#each observed.attachments ?? [] as file (file.id)}<li>
          {file.filename} · {file.kind}
        </li>{/each}
    </ul>
    {#if observed.location}<p>
        {t('conflict.location', {
          label: observed.location.label ?? '',
          latitude: observed.location.latitude,
          longitude: observed.location.longitude,
        })}
      </p>{/if}
    <details>
      <summary>{t('conflict.localRetained')}</summary>
      <pre>{workspace.active?.bodyMarkdown}</pre>
      <ul>
        {#each workspace.active?.attachments ?? [] as file (file.id)}<li>
            {file.filename} · {file.source}
          </li>{/each}
      </ul>
    </details>
    <div class="choices">
      <button
        disabled={workspace.busy || workspace.conflict}
        onclick={() => choose('load')}>{t('conflict.loadServer')}</button
      >
      <button
        disabled={workspace.busy || workspace.conflict}
        onclick={() => choose('copy')}>{t('conflict.saveSeparate')}</button
      >
      <button
        class="danger"
        disabled={workspace.busy ||
          workspace.conflict ||
          observed.status === 'trash'}
        onclick={() => choose('replace')}
        >{t('conflict.replaceRevision', {
          revision: observed.revision,
        })}</button
      >
      <button
        onclick={() => {
          open = false;
        }}>{t('conflict.keepLocal')}</button
      >
    </div>
    {#if observed.status === 'trash'}<p>
        {t('conflict.restoreFirst')}
      </p>{/if}
  {/if}
</Modal>
<Modal bind:open={confirm} title={t('conflict.confirmTitle')}>
  <p>
    {choice === 'replace'
      ? t('conflict.confirmReplace', { revision: observed?.revision ?? '' })
      : choice === 'copy'
        ? t('conflict.confirmCopy')
        : observed?.status === 'trash'
          ? t('conflict.confirmTrash')
          : t('conflict.confirmLoad')}
  </p>
  <p>
    {t('conflict.discardNote')}
  </p>
  <button disabled={workspace.busy} onclick={resolve}
    >{t('conflict.confirmAction', {
      action:
        choice === 'replace'
          ? t('conflict.actReplace')
          : choice === 'copy'
            ? t('conflict.actCopy')
            : t('conflict.actLoad'),
    })}</button
  >
</Modal>

<style>
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 16rem;
    overflow: auto;
    padding: var(--space-2);
    border: 1px solid var(--border);
  }
  .choices {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
