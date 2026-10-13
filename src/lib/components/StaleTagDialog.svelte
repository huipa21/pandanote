<script lang="ts">
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;
  let open = $derived(
    workspace.staleTagChoices.length > 0 && !workspace.posting,
  );
  async function choose(choice: 'history' | 'remove' | 'recreate') {
    if (choice === 'recreate' && !confirm(t('stale.recreateConfirm'))) return;
    if (await workspace.resolveStaleTags(choice)) open = false;
  }
</script>

<Modal bind:open title={t('stale.title')} dismissible={!workspace.busy}>
  <p>
    {t('stale.help')}
  </p>
  <ul>
    {#each workspace.staleTagChoices as tag (tag.key)}<li>
        {t('stale.item', {
          tag: tag.key,
          target: tag.target === null ? t('tag.removed') : `#${tag.target}`,
          generation: tag.generation,
        })}
      </li>{/each}
  </ul>
  {#if workspace.frozen}<p>
      {t('stale.frozen')}
    </p>{/if}
  <button disabled={workspace.busy} onclick={() => choose('history')}
    >{t('stale.history')}</button
  >
  <button disabled={workspace.busy} onclick={() => choose('remove')}
    >{t('stale.removeLocal')}</button
  >
  <button disabled={workspace.busy} onclick={() => choose('recreate')}
    >{t('stale.recreate')}</button
  >
  <p>
    {t('stale.nothingPosts')}
  </p>
  {#if workspace.error}<p role="alert">{workspace.error}</p>{/if}
</Modal>
