<script lang="ts">
  import Modal from './Modal.svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  let { workspace }: { workspace: EditorWorkspace } = $props();
  let open = $derived(
    workspace.staleTagChoices.length > 0 && !workspace.posting,
  );
  async function choose(choice: 'history' | 'remove' | 'recreate') {
    if (
      choice === 'recreate' &&
      !confirm(
        'Intentionally keep or recreate these retired tags? This does not undo management changes on other notes.',
      )
    )
      return;
    if (await workspace.resolveStaleTags(choice)) open = false;
  }
</script>

<Modal bind:open title="Review retired tags" dismissible={!workspace.busy}>
  <p>
    Your local source and files are unchanged. Choose how to handle tags that
    were renamed, merged or removed.
  </p>
  <ul>
    {#each workspace.staleTagChoices as tag (tag.key)}<li>
        #{tag.key} → {tag.target === null ? 'removed' : `#${tag.target}`} · history
        {tag.generation}
      </li>{/each}
  </ul>
  {#if workspace.frozen}<p>
      This save is frozen. A resolution creates an editable copy.
    </p>{/if}
  <button disabled={workspace.busy} onclick={() => choose('history')}
    >Apply rename/removal history locally</button
  >
  <button disabled={workspace.busy} onclick={() => choose('remove')}
    >Remove these hashtags locally</button
  >
  <button disabled={workspace.busy} onclick={() => choose('recreate')}
    >Intentionally keep or recreate retired tags</button
  >
  <p>
    Nothing posts automatically. Review your source and explicitly Post or Save
    changes. Another tag change will require a new review.
  </p>
  {#if workspace.error}<p role="alert">{workspace.error}</p>{/if}
</Modal>
