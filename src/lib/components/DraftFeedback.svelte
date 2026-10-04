<script lang="ts">
  import Modal from './Modal.svelte';
  import type { DraftWorkspace } from '#lib/client/drafts/workspace.svelte.ts';
  let { workspace }: { workspace: DraftWorkspace } = $props();
  let confirmLoad = $state(false);
</script>

<div class="draft-feedback">
  {#if workspace.postProgress}
    <div class="posting-progress" role="status" aria-live="polite">
      <span
        >{workspace.postProgress.stage} · {workspace.postProgress
          .completed}/{workspace.postProgress.total} files ready</span
      >
      {#if workspace.postProgress.bytes > 0}
        <progress
          aria-label="File upload progress"
          value={workspace.postProgress.loaded}
          max={workspace.postProgress.bytes}
        ></progress>
      {/if}
    </div>
  {/if}
  {#if workspace.postError}
    <p class="draft-error" role="alert">
      {workspace.postError}
      {#if workspace.postRequiresLogin}<a href="/login"
          >Sign in again — this draft stays on this device</a
        >{/if}
    </p>
  {/if}
  {#if workspace.frozen && !workspace.posting}
    <div class="draft-error">
      <p>
        This save is frozen for safe retry. Editing a separate copy does not
        cancel it; it may already be saved on the server. Retry first to check.
      </p>
      <button
        disabled={workspace.busy || workspace.conflict}
        onclick={() => workspace.post()}>Check and retry save</button
      >
      <button disabled={workspace.busy} onclick={() => workspace.keepSeparate()}
        >Edit a separate copy</button
      >
    </div>
  {/if}
  {#if workspace.postConflict}
    <details class="draft-error">
      <summary
        >Server version (revision {workspace.postConflict.revision}) — your
        local version is retained</summary
      >
      <pre>{workspace.postConflict.bodyMarkdown}</pre>
    </details>
  {/if}
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
        {#each workspace.active.attachments as item, index (item.id)}
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
              disabled={workspace.busy ||
                workspace.conflict ||
                workspace.frozen}
              onclick={() => workspace.removeAttachment(item.id)}
              >Remove {item.filename}</button
            >
            <button
              disabled={workspace.busy ||
                workspace.conflict ||
                workspace.frozen ||
                index === 0}
              onclick={() => workspace.reorderAttachment(item.id, -1)}
              >Move {item.filename} earlier</button
            >
            <button
              disabled={workspace.busy ||
                workspace.conflict ||
                workspace.frozen ||
                index === workspace.active!.attachments.length - 1}
              onclick={() => workspace.reorderAttachment(item.id, 1)}
              >Move {item.filename} later</button
            >
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>
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
  .draft-feedback {
    flex: none;
    max-height: min(10rem, 30dvh);
    overflow: auto;
  }
  .posting-progress {
    font-size: 0.875rem;
    flex: none;
  }
  progress {
    display: block;
    max-width: 100%;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
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
