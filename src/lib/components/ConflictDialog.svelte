<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import type { DraftWorkspace } from '#lib/client/drafts/workspace.svelte.ts';
  import type { NoteSnapshot } from '#lib/shared/domain.ts';
  let { workspace }: { workspace: DraftWorkspace } = $props();
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
      // Trash is view-only until restored (S13). Keep losing recovery intact.
      if (await workspace.flush())
        await goto(`/notes/${version.id}`, { reset: false });
      return;
    }
    await workspace.resolveServerConflict(choice, version);
  }
</script>

<Modal bind:open title="Note conflict" dismissible={!workspace.busy}>
  <p>
    The server changed. Nothing has been overwritten. Your local text and new
    file blobs are retained on this device.
  </p>
  {#if observed}
    <h3>Server version · revision {observed.revision} · {observed.status}</h3>
    <p>
      Timeline: {new Date(observed.timelineAt).toLocaleString('en', {
        timeZone: workspace.timezone,
      })}
    </p>
    <pre>{observed.bodyMarkdown}</pre>
    <ul>
      {#each observed.attachments ?? [] as file (file.id)}<li>
          {file.filename} · {file.kind}
        </li>{/each}
    </ul>
    {#if observed.location}<p>
        Location: {observed.location.label ?? ''}
        {observed.location.latitude}, {observed.location.longitude}
      </p>{/if}
    <details>
      <summary>Your retained local version</summary>
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
        onclick={() => choose('load')}>Load server version</button
      >
      <button
        disabled={workspace.busy || workspace.conflict}
        onclick={() => choose('copy')}>Save local as separate note</button
      >
      <button
        class="danger"
        disabled={workspace.busy ||
          workspace.conflict ||
          observed.status === 'trash'}
        onclick={() => choose('replace')}
        >Explicitly replace revision {observed.revision}</button
      >
      <button
        onclick={() => {
          open = false;
        }}>Keep local edits</button
      >
    </div>
    {#if observed.status === 'trash'}<p>
        Restore the server note before replacing or editing it. You can publish
        your local version separately.
      </p>{/if}
  {/if}
</Modal>
<Modal bind:open={confirm} title="Confirm conflict resolution">
  <p>
    {choice === 'replace'
      ? `Replace server revision ${observed?.revision} with your local version? A newer revision will conflict again, never be forced over.`
      : choice === 'copy'
        ? 'Publish your local version as a separate note? Existing server attachments can be shared safely.'
        : observed?.status === 'trash'
          ? 'View the current server version in Trash? Your losing version and files will remain in local Drafts.'
          : 'Load the current server version into the editor? Your losing version and files will remain in local Drafts.'}
  </p>
  <p>
    The original recovery is kept, including its retry identity. It is not
    automatically canceled or posted.
  </p>
  <button disabled={workspace.busy} onclick={resolve}
    >Confirm {choice === 'replace'
      ? 'replace'
      : choice === 'copy'
        ? 'separate note'
        : 'load server'}</button
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
