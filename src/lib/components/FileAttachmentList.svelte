<script lang="ts">
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { isVideoAttachment } from '#lib/client/recording/clips.ts';
  import { formatFileSize } from '#lib/shared/attachments.ts';
  import FileTypeIcon from './FileTypeIcon.svelte';

  /** Generic (non-image, non-video, non-voice-clip) attachments as plain
   * download-style rows below the photo/video grid and voice clips, in
   * attachment order. No reordering: these are not a visual grid. */
  let { workspace }: { workspace: EditorWorkspace } = $props();
  const t = useI18n().t;
  const files = $derived(
    (workspace.active?.attachments ?? []).filter(
      (a) => a.kind === 'file' && !isVideoAttachment(a),
    ),
  );
  const locked = $derived(
    workspace.busy || workspace.conflict || workspace.frozen,
  );
</script>

{#if files.length}
  <ul
    class="file-attachments"
    aria-label={t('attach.fileList', { count: files.length })}
  >
    {#each files as file (file.id)}
      {@const size = formatFileSize(file.size)}
      <li>
        <FileTypeIcon filename={file.filename} />
        <span class="name" title={file.filename}>{file.filename}</span>
        <span class="size">{t(size.key, size.params)}</span>
        {#if workspace.missing.includes(file.id)}
          <label class="repair"
            >{t('attach.repair', { name: file.filename })}<input
              type="file"
              onchange={(event) => {
                const picked = event.currentTarget.files?.[0];
                if (picked) void workspace.repairAttachment(file.id, picked);
                event.currentTarget.value = '';
              }}
            /></label
          >
        {/if}
        <button
          type="button"
          class="remove"
          aria-label={t('attach.remove', { name: file.filename })}
          title={t('attach.removeTitle')}
          disabled={locked}
          onclick={() => workspace.removeAttachment(file.id)}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="m7 7 10 10M17 7 7 17" /></svg
          ></button
        >
      </li>
    {/each}
  </ul>
{/if}

<style>
  .file-attachments {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: var(--space-1) var(--space-3);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.25rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) / 2);
    background: var(--accent-soft);
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    flex: none;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .repair {
    flex: none;
    font-size: 0.75rem;
    color: var(--danger);
  }
  .remove {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }
  .remove svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
</style>
