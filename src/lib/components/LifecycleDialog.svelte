<script lang="ts">
  import { getContext } from 'svelte';
  import { invalidate } from '$app/navigation';
  import {
    LIFECYCLE,
    type LifecycleState,
  } from '#lib/client/editor/lifecycle.svelte.ts';
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  const t = useI18n().t;
  const lifecycle = getContext<LifecycleState>(LIFECYCLE);
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  // Immediate (silent) actions only surface this dialog after they fail.
  let open = $derived(
    Boolean(lifecycle.selected && !lifecycle.selected.silent),
  );
  const title = $derived(
    lifecycle.selected?.action === 'permanent-delete'
      ? t('lifecycle.titlePermanent')
      : lifecycle.selected?.action === 'restore'
        ? t('lifecycle.titleRestore')
        : lifecycle.selected?.action === 'pin'
          ? t('lifecycle.titlePin')
          : lifecycle.selected?.action === 'unpin'
            ? t('lifecycle.titleUnpin')
            : t('lifecycle.titleTrash'),
  );
</script>

<Modal
  bind:open
  {title}
  dismissible={!lifecycle.busy}
  onDismiss={() => {
    lifecycle.selected = null;
  }}
>
  {#if lifecycle.selected}
    <p>
      {lifecycle.selected.action === 'permanent-delete'
        ? t('lifecycle.descPermanent')
        : lifecycle.selected.action === 'restore'
          ? t('lifecycle.descRestore')
          : lifecycle.selected.action === 'pin'
            ? t('lifecycle.descPin')
            : lifecycle.selected.action === 'unpin'
              ? t('lifecycle.descUnpin')
              : t('lifecycle.descTrash')}
    </p>
    {#if lifecycle.error}<p role="alert">{lifecycle.error}</p>{/if}
    {#if lifecycle.observed}<p>
        {t('lifecycle.serverNow', {
          status: lifecycle.observed.status,
          revision: lifecycle.observed.revision,
        })}
      </p>{/if}
    <a
      href={`/notes/${lifecycle.selected.target.id}`}
      aria-disabled={lifecycle.busy}
      onclick={(event) => {
        if (lifecycle.busy) event.preventDefault();
        else lifecycle.selected = null;
      }}>{t('lifecycle.inspect')}</a
    >
    {#if lifecycle.error}<button
        disabled={lifecycle.busy}
        onclick={() => {
          const note = lifecycle.observed ?? lifecycle.selected!.target;
          workspace.recordMutation({
            noteId: note.id,
            revision: note.revision,
            status: note.status,
            deleted: false,
          });
          lifecycle.selected = null;
          void invalidate('pandanote:timeline');
          void invalidate('pandanote:status-notes');
          void invalidate('pandanote:detail');
        }}>{t('lifecycle.refreshServer')}</button
      >{/if}
    <button
      class:danger={lifecycle.selected.action === 'permanent-delete'}
      disabled={lifecycle.busy || !lifecycle.ready}
      onclick={() => lifecycle.confirm()}
      >{lifecycle.busy
        ? t('lifecycle.saving')
        : lifecycle.selected.attempt
          ? t('lifecycle.retrySame')
          : lifecycle.selected.action === 'permanent-delete'
            ? t('lifecycle.confirmPermanent')
            : lifecycle.selected.action === 'restore'
              ? t('lifecycle.confirmRestore')
              : lifecycle.selected.action === 'pin'
                ? t('lifecycle.confirmPin')
                : lifecycle.selected.action === 'unpin'
                  ? t('lifecycle.confirmUnpin')
                  : t('lifecycle.confirmMove')}</button
    >
    {#if lifecycle.selected.attempt}<p class="help">
        {t('lifecycle.stopNote')}
      </p>
      <button
        disabled={lifecycle.busy}
        onclick={() => {
          if (lifecycle.selected?.attempt)
            lifecycle.forget(lifecycle.selected.attempt);
        }}>{t('lifecycle.stop')}</button
      >{/if}
  {/if}
</Modal>
