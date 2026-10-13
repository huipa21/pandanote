<script lang="ts">
  import type { TagOperations } from '#lib/client/tags/operations.svelte.ts';
  import type { TagAction, TagExecute } from '#lib/shared/tags.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';
  const t = useI18n().t;
  const ACTIONS = {
    rename: 'tag.actRename',
    merge: 'tag.actMerge',
    remove: 'tag.actRemove',
  } as const satisfies Record<TagAction['action'], MessageKey>;
  let {
    ops,
    onExecuted = () => {},
  }: {
    ops: TagOperations;
    onExecuted?: (command: TagExecute) => void;
  } = $props();
</script>

{#if ops.pending.length}
  <section class="pending" aria-label={t('pending.aria')}>
    <h2>{t('pending.heading')}</h2>
    <p class="help">
      {t('pending.help')}
    </p>
    {#each ops.pending as command (command.mutationId)}
      <div class="row">
        <span
          >{t(ACTIONS[command.operation.action])} #{command.operation
            .source}</span
        >
        <button
          disabled={ops.busy}
          onclick={async () => {
            if (await ops.execute(command)) onExecuted(command);
          }}>{t('pending.check')}</button
        >
        <button
          disabled={ops.busy}
          onclick={() => {
            if (confirm(t('pending.stopConfirm'))) ops.discard(command);
          }}>{t('pending.stop')}</button
        >
      </div>
    {/each}
  </section>
{/if}

<style>
  .pending {
    margin-block: var(--space-4);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block: var(--space-2);
  }
</style>
