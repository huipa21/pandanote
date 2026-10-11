<script lang="ts">
  import type { TagOperations } from '#lib/client/tags/operations.svelte.ts';
  import type { TagExecute } from '#lib/shared/tags.ts';
  let {
    ops,
    onExecuted = () => {},
  }: {
    ops: TagOperations;
    onExecuted?: (command: TagExecute) => void;
  } = $props();
</script>

{#if ops.pending.length}
  <section class="pending" aria-label="Unconfirmed tag operations">
    <h2>Unconfirmed tag operations · this browser</h2>
    <p class="help">
      Retry to check the original result. Stopping a retry does not cancel or
      undo a server operation.
    </p>
    {#each ops.pending as command (command.mutationId)}
      <div class="row">
        <span>{command.operation.action} #{command.operation.source}</span>
        <button
          disabled={ops.busy}
          onclick={async () => {
            if (await ops.execute(command)) onExecuted(command);
          }}>Check and retry tag operation</button
        >
        <button
          disabled={ops.busy}
          onclick={() => {
            if (
              confirm(
                'Stop retrying? This does not cancel or undo the server operation.',
              )
            )
              ops.discard(command);
          }}>Stop retrying</button
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
