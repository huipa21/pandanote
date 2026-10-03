<script lang="ts">
  import Modal from './Modal.svelte';
  import type { DraftWorkspace } from '#lib/client/drafts/workspace.svelte.ts';
  let { workspace }: { workspace: DraftWorkspace } = $props();
  let confirmLoad = $state(false);
</script>

{#if workspace.error}
  <div class="draft-error" role="alert">
    <p>{workspace.error}</p>
    {#if workspace.conflict}
      <button onclick={() => workspace.keepSeparate()}
        >Save my version as another draft</button
      >
      <button
        onclick={() => {
          confirmLoad = true;
        }}>Load saved version</button
      >
    {:else}
      <button onclick={() => workspace.flush()}>Retry saving locally</button>
      <button onclick={() => workspace.loadFiles()}
        >Check local files again</button
      >
    {/if}
  </div>
{/if}
{#if workspace.active?.attachments.length}
  <details class="attachments">
    <summary
      >Attachments ({workspace.active.attachments.length}){workspace.missing
        .length
        ? ' — missing files'
        : ''}</summary
    >
    <ul>
      {#each workspace.active.attachments as item (item.id)}
        <li>
          <span
            >{item.filename} · {item.kind} · {item.size} bytes · {item.source ===
            'local'
              ? 'device-only'
              : 'server reference'}</span
          >
          {#if workspace.missing.includes(item.id)}
            <strong role="alert"
              >Missing file — choose the original or remove it. Posting must
              wait.</strong
            >
            <label
              >Repair {item.filename}<input
                type="file"
                onchange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void workspace.repairAttachment(item.id, file);
                  event.currentTarget.value = '';
                }}
              /></label
            >
          {/if}
          <button
            disabled={workspace.busy || workspace.conflict}
            onclick={() => workspace.removeAttachment(item.id)}
            >Remove {item.filename}</button
          >
        </li>
      {/each}
    </ul>
  </details>
{/if}
<Modal bind:open={confirmLoad} title="Replace this editor's version?">
  <p>
    Your current in-memory version will be replaced. Save it as another draft
    first if you want to keep it.
  </p>
  <button
    onclick={async () => {
      if (await workspace.loadSaved()) confirmLoad = false;
    }}>Confirm load saved version</button
  >
</Modal>

<style>
  .draft-error,
  .attachments {
    flex: none;
    max-height: 8rem;
    overflow: auto;
    font-size: 0.875rem;
  }
  .draft-error p {
    margin-block: var(--space-1);
  }
  summary {
    cursor: pointer;
    padding-block: var(--space-1);
  }
  ul {
    padding-left: var(--space-4);
  }
  li {
    margin-bottom: var(--space-2);
    overflow-wrap: anywhere;
  }
  li span,
  li strong,
  label {
    display: block;
  }
  input {
    max-width: 100%;
  }
</style>
