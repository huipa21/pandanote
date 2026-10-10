<script lang="ts">
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  let { workspace }: { workspace: EditorWorkspace } = $props();
</script>

<div class="editor-feedback">
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
    <p class="editor-error" role="alert">
      {workspace.postError}
      {#if workspace.postRequiresLogin}<a href="/login"
          >Sign in again to save this note</a
        >{/if}
    </p>
  {/if}
  {#if workspace.frozen && !workspace.posting}
    <div class="editor-error">
      <p>
        This save is frozen for safe retry. It may already have committed. Retry
        first; starting a new attempt does not cancel or undo the original.
      </p>
      <button
        disabled={workspace.busy || workspace.conflict}
        onclick={() => workspace.post()}>Check and retry save</button
      >
      <button disabled={workspace.busy} onclick={() => workspace.keepSeparate()}
        >Edit as new note</button
      >
    </div>
  {/if}
  {#if workspace.postConflict}
    <div class="editor-error">
      <button
        onclick={() => {
          workspace.postConflict = { ...workspace.postConflict! };
        }}
        >Compare server version (revision {workspace.postConflict
          .revision})</button
      >
      <p>
        Your current text is retained. Resolve the conflict or keep editing.
      </p>
    </div>
  {/if}
  {#if workspace.error}
    <div class="editor-error" role="alert">
      <p>{workspace.error}</p>
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
                ? 'attached'
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

<style>
  .editor-feedback {
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
  .editor-error,
  .attachments {
    flex: none;
    max-height: 8rem;
    overflow: auto;
    font-size: 0.875rem;
  }
  .editor-error p {
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
