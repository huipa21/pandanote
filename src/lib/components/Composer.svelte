<script lang="ts">
  import { tick, getContext, onMount, untrack } from 'svelte';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import DraftFeedback from './DraftFeedback.svelte';
  import TimelineOptions from './TimelineOptions.svelte';
  const workspace = getContext<DraftWorkspace | undefined>(DRAFT_WORKSPACE);
  import Modal from './Modal.svelte';
  import Markdown from './Markdown.svelte';
  let tab = $state<'write' | 'preview'>('write');
  let memoryText = $state('');
  let text = $derived(
    workspace ? (workspace.active?.bodyMarkdown ?? '') : memoryText,
  );
  let fileInput = $state<HTMLInputElement>(null!);
  let cursor = { start: 0, end: 0 };
  function changed(event: Event) {
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    if (workspace) workspace.change(value);
    else memoryText = value;
  }
  function rememberCursor(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement;
    cursor = { start: input.selectionStart, end: input.selectionEnd };
  }
  function addFiles(files: File[]) {
    if (workspace && files.length)
      void workspace.addFiles(files, cursor.start, cursor.end);
  }
  function paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length && workspace) {
      event.preventDefault();
      rememberCursor(event);
      addFiles(files);
    }
  }
  function drop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length && workspace) {
      event.preventDefault();
      rememberCursor(event);
      addFiles(files);
    }
  }
  $effect(() => {
    if (!workspace?.openEditor) return;
    expanded = true;
    tab = 'write';
    if (matchMedia('(max-width: 899px)').matches) {
      editorOpen = true;
      void tick().then(() =>
        document.getElementById('expanded-note-text')?.focus(),
      );
    } else void tick().then(() => textarea?.focus());
  });
  let expanded = $state(false);
  let editorOpen = $state(false);
  let textarea = $state<HTMLTextAreaElement>();
  let desktop = $state(false);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    const media = matchMedia('(min-width: 900px)');
    const changed = () => {
      desktop = media.matches;
    };
    changed();
    media.addEventListener('change', changed);
    return () => {
      media.removeEventListener('change', changed);
      workspace?.setPreviewVisible(false);
    };
  });
  $effect(() => {
    const visible = tab === 'preview' && (editorOpen || (desktop && expanded));
    if (workspace?.ready) untrack(() => workspace.setPreviewVisible(visible));
  });
  async function expand() {
    expanded = true;
    await tick();
    textarea?.focus();
  }
  $effect(() => {
    if (workspace || !text) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
</script>

{#snippet postButton()}
  <button
    class="primary"
    disabled={!workspace?.canPost}
    onclick={() => workspace?.post()}
  >
    {workspace?.posting
      ? 'Saving…'
      : workspace?.frozen
        ? 'Retry save'
        : workspace?.active?.kind === 'edit-published'
          ? 'Save changes'
          : 'Post'}
  </button>
{/snippet}

{#if workspace}
  <input
    class="sr-only"
    tabindex="-1"
    aria-label="Choose local files"
    type="file"
    multiple
    disabled={!workspace.ready || workspace.busy || workspace.frozen}
    bind:this={fileInput}
    onchange={(event) => {
      addFiles(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = '';
    }}
  />
{/if}
{#if workspace?.error && !editorOpen && (!desktop || !expanded)}
  <p role="alert">{workspace.error} Open the editor for recovery actions.</p>
{/if}
<div class="desktop-composer surface" data-testid="composer">
  {#if !expanded}
    <button
      class="start-writing"
      disabled={!mounted}
      onfocus={expand}
      onclick={expand}>Write a note…</button
    >
  {:else}
    <div class="editor-tabs" role="group" aria-label="Editor mode">
      <button
        aria-pressed={tab === 'write'}
        onclick={() => {
          tab = 'write';
        }}>Write</button
      >
      <button
        aria-pressed={tab === 'preview'}
        onclick={() => {
          tab = 'preview';
        }}>Preview</button
      >
      {#if workspace}<button
          disabled={!workspace.ready ||
            workspace.busy ||
            workspace.conflict ||
            workspace.frozen}
          onclick={() => fileInput.click()}>Add files</button
        ><TimelineOptions {workspace} />{/if}
    </div>
    {#if tab === 'preview'}
      <div class="compact-preview preview-pane">
        {#if !editorOpen}
          <Markdown
            source={text}
            images={workspace?.images ?? []}
            debounce={300}
          />
        {/if}
      </div>
    {:else}
      <label class="sr-only" for="compact-note-text">Note text</label>
      <textarea
        id="compact-note-text"
        bind:this={textarea}
        value={text}
        disabled={Boolean(
          workspace && (!workspace.ready || workspace.busy || workspace.frozen),
        )}
        oninput={changed}
        onselect={rememberCursor}
        onkeyup={rememberCursor}
        onclick={rememberCursor}
        onblur={() => workspace?.flush()}
        onpaste={paste}
        ondrop={drop}
        ondragover={(event) => {
          if (event.dataTransfer?.types.includes('Files'))
            event.preventDefault();
        }}
        rows="3"
        placeholder="A thought, a small discovery…"
        aria-describedby="composer-help"></textarea>
    {/if}
    {#if workspace}<DraftFeedback {workspace} />{/if}
    <div class="composer-actions">
      <button
        onclick={() => {
          editorOpen = true;
        }}>Expand editor</button
      >
      <button
        onclick={() => {
          expanded = false;
        }}
        disabled={Boolean(text)}>Collapse editor</button
      >
      {@render postButton()}
    </div>
    <p class="help" id="composer-help">
      {#if workspace}<span role="status"
          >{workspace.status ||
            'Device-only draft · publish only with Post.'}</span
        >{:else}Text is not saved yet (S05); posting comes in S08. Keep a copy
        before leaving.{/if}
    </p>
  {/if}
</div>
<button
  class="mobile-compose primary"
  disabled={!mounted}
  onclick={() => {
    editorOpen = true;
  }}>{text ? 'Continue writing' : 'Compose a note'}</button
>

<Modal bind:open={editorOpen} title="Write a note" kind="editor">
  <div class="editor-tabs" role="group" aria-label="Editor mode">
    <button
      aria-pressed={tab === 'write'}
      onclick={() => {
        tab = 'write';
      }}>Write</button
    >
    <button
      aria-pressed={tab === 'preview'}
      onclick={() => {
        tab = 'preview';
      }}>Preview</button
    >
    {#if workspace}<button
        disabled={!workspace.ready ||
          workspace.busy ||
          workspace.conflict ||
          workspace.frozen}
        onclick={() => fileInput.click()}>Add files</button
      ><TimelineOptions {workspace} />{/if}
  </div>
  {#if tab === 'preview'}
    <div class="expanded-preview preview-pane">
      <Markdown source={text} images={workspace?.images ?? []} debounce={300} />
    </div>
  {:else}
    <label class="sr-only" for="expanded-note-text">Note text</label>
    <textarea
      id="expanded-note-text"
      class="expanded-text"
      value={text}
      disabled={Boolean(
        workspace && (!workspace.ready || workspace.busy || workspace.frozen),
      )}
      oninput={changed}
      onselect={rememberCursor}
      onkeyup={rememberCursor}
      onclick={rememberCursor}
      onblur={() => workspace?.flush()}
      onpaste={paste}
      ondrop={drop}
      ondragover={(event) => {
        if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
      }}
      data-initial-focus
      aria-describedby="expanded-help"
      placeholder="A thought, a small discovery…"></textarea>
  {/if}
  {#if workspace}<DraftFeedback {workspace} />{/if}
  <div class="editor-footer">
    <p class="help" id="expanded-help">
      {#if workspace}<span role="status"
          >{workspace.status ||
            'Device-only draft · publish only with Post.'}</span
        >{:else}
        <span class="full-help"
          >Text stays here while navigating this shell, but is not saved on
          reload. Draft recovery comes in S05; posting comes in S08.</span
        >
        <span class="short-help"
          >Not saved yet. Draft recovery: S05; posting: S08.</span
        >
      {/if}
    </p>
    {@render postButton()}
  </div>
</Modal>

<style>
  .editor-tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .editor-tabs [aria-pressed='true'] {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .preview-pane {
    min-height: 0;
    overflow: auto;
  }
  .compact-preview {
    max-height: 12rem;
  }
  .expanded-preview {
    flex: 1;
    height: 40dvh;
  }
  .desktop-composer {
    padding: var(--space-3);
  }
  .start-writing {
    width: 100%;
    text-align: left;
    color: var(--muted);
    border: 0;
  }
  textarea {
    width: 100%;
    display: block;
    resize: none;
  }
  .composer-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-top: var(--space-2);
  }
  .composer-actions .primary {
    margin-left: auto;
  }
  .help {
    margin-bottom: 0;
  }
  .mobile-compose {
    display: none;
  }
  .expanded-text {
    flex: 1;
    min-height: 8rem;
    height: 40dvh;
  }
  .editor-footer {
    display: flex;
    flex: none;
    gap: var(--space-3);
    align-items: center;
    padding-top: var(--space-3);
  }
  .editor-footer .help {
    margin: 0;
  }
  .short-help {
    display: none;
  }
  @media (max-width: 899px) and (max-height: 400px) {
    .editor-tabs {
      margin-bottom: var(--space-1);
    }
    .editor-footer {
      padding-top: var(--space-1);
    }
    .editor-tabs button {
      min-height: 2rem;
      padding-block: 0;
    }
    .full-help {
      display: none;
    }
    .short-help {
      display: inline;
    }
    .editor-footer .help {
      font-size: 0.75rem;
      line-height: 1.4;
    }
  }
  @media (max-width: 899px) {
    .desktop-composer {
      display: none;
    }
    .mobile-compose {
      display: block;
      min-width: var(--target);
    }
    .expanded-text {
      height: auto;
      min-height: 0;
    }
  }
  @media (max-height: 540px) and (min-width: 900px) {
    .desktop-composer textarea {
      height: 4rem;
    }
    .desktop-composer .help {
      font-size: 0.75rem;
    }
  }
</style>
