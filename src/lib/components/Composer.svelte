<script lang="ts">
  import { tick, getContext, onMount, untrack } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import EditorFeedback from './EditorFeedback.svelte';
  import AttachmentGrid from './AttachmentGrid.svelte';
  import TagAutocomplete from './TagAutocomplete.svelte';
  import EditorOptions from './EditorOptions.svelte';
  import Modal from './Modal.svelte';
  import Markdown from './Markdown.svelte';
  import { MEDIA_ACCEPT } from '#lib/client/uploads/file-kind.ts';

  const workspace = getContext<EditorWorkspace | undefined>(EDITOR_WORKSPACE);
  let preview = $state(false);
  let memoryText = $state('');
  let text = $derived(
    workspace ? (workspace.active?.bodyMarkdown ?? '') : memoryText,
  );
  let fileInput = $state<HTMLInputElement>(null!);
  let cursor = { start: 0, end: 0 };
  let expanded = $state(false);
  let editorOpen = $state(false);
  let textarea = $state<HTMLTextAreaElement>();
  let expandedTextarea = $state<HTMLTextAreaElement>();
  let desktop = $state(false);
  let mounted = $state(false);

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
    if (workspace && files.length) void workspace.addFiles(files);
  }
  function paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length && workspace) {
      event.preventDefault();
      addFiles(files);
    }
  }
  function drop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length && workspace) {
      event.preventDefault();
      addFiles(files);
    }
  }
  async function addTag() {
    if (!workspace || workspace.busy || workspace.frozen || workspace.conflict)
      return;
    preview = false;
    const prefix = text.slice(0, cursor.start);
    const marker = prefix && !/\s$/.test(prefix) ? ' #' : '#';
    workspace.change(prefix + marker + text.slice(cursor.end));
    cursor = {
      start: cursor.start + marker.length,
      end: cursor.start + marker.length,
    };
    await tick();
    const input = editorOpen ? expandedTextarea : textarea;
    input?.focus();
    input?.setSelectionRange(cursor.start, cursor.end);
    // Uses the existing local-only, AST-aware tag suggestions.
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function handleCloseEditor(focus: boolean) {
    if (!workspace) {
      editorOpen = !focus;
      return;
    }
    if (!focus) {
      editorOpen = true;
      return;
    }
    // Desktop X leaves focus mode; mobile X closes the only visible editor.
    if (desktop || (await workspace.promptUnsavedChanges())) editorOpen = false;
  }

  $effect(() => {
    if (!workspace?.openEditor) return;
    expanded = true;
    preview = false;
    if (matchMedia('(max-width: 899px)').matches) {
      editorOpen = true;
      void tick().then(() =>
        document.getElementById('expanded-note-text')?.focus(),
      );
    } else void tick().then(() => textarea?.focus());
  });
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
    const visible = preview && (editorOpen || (desktop && expanded));
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
        : workspace?.active?.kind === 'edit'
          ? 'Save changes'
          : 'Post'}
  </button>
{/snippet}

{#snippet editor(focus: boolean)}
  <div class="editor-container" class:focus-editor={focus}>
    {#if preview}
      <div
        class="preview-pane"
        class:expanded-preview={focus}
        class:compact-preview={!focus}
      >
        {#if focus || !editorOpen}<Markdown
            source={text}
            images={workspace?.images ?? []}
            debounce={300}
          />{/if}
      </div>
    {:else}
      <label
        class="sr-only"
        for={focus ? 'expanded-note-text' : 'compact-note-text'}
        >Note text</label
      >
      <textarea
        id={focus ? 'expanded-note-text' : 'compact-note-text'}
        bind:this={
          () => (focus ? expandedTextarea : textarea),
          (input) => {
            if (focus) expandedTextarea = input;
            else textarea = input;
          }
        }
        class:expanded-text={focus}
        value={text}
        disabled={Boolean(
          workspace && (!workspace.ready || workspace.busy || workspace.frozen),
        )}
        oninput={changed}
        onselect={rememberCursor}
        onkeyup={rememberCursor}
        onclick={rememberCursor}
        onblur={(event) => {
          rememberCursor(event);
        }}
        onpaste={paste}
        ondrop={drop}
        ondragover={(event) => {
          if (event.dataTransfer?.types.includes('Files'))
            event.preventDefault();
        }}
        data-initial-focus={focus || undefined}
        rows="4"
        aria-describedby={focus ? 'expanded-help' : 'composer-help'}
        placeholder="A thought, a small discovery…"></textarea>
      {#if workspace}<TagAutocomplete
          textarea={focus ? expandedTextarea : textarea}
          {workspace}
        />{/if}
    {/if}
    {#if workspace}<AttachmentGrid {workspace} /><EditorFeedback
        {workspace}
      />{/if}
    <p class="help" id={focus ? 'expanded-help' : 'composer-help'}>
      {#if workspace}<span role="status"
          >{workspace.status ||
            (workspace.active?.kind === 'edit'
              ? 'Editing note · save with Save changes.'
              : 'New note · publish with Post.')}</span
        >
      {:else}Not saved yet. Keep a copy before leaving.{/if}
    </p>
    <div class="editor-footer">
      <EditorOptions
        {workspace}
        onTag={addTag}
        onFiles={() => fileInput.click()}
      />
      <button
        class="preview-switch"
        type="button"
        role="switch"
        aria-label="Preview"
        aria-checked={preview}
        onclick={() => {
          preview = !preview;
        }}
        title={preview ? 'Show raw text' : 'Preview Markdown'}
        ><span class="switch-track" aria-hidden="true"><span></span></span
        >Preview</button
      >
      <button
        class="focus-control"
        type="button"
        aria-label={focus ? 'Close Write a note' : 'Enter focus mode'}
        title={focus ? 'Close focus mode' : 'Focus mode'}
        onclick={() => {
          void handleCloseEditor(focus);
        }}
      >
        {#if focus}<svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="m6 6 12 12M18 6 6 18" /></svg
          >
        {:else}<svg viewBox="0 0 24 24" aria-hidden="true"
            ><path
              d="M8 3H3v5m0-5 6 6m7-6h5v5m0-5-6 6M3 16v5h5m-5 0 6-6m12 1v5h-5m5 0-6-6"
            /></svg
          >{/if}
      </button>
      {@render postButton()}
    </div>
  </div>
{/snippet}

{#if workspace}
  <input
    class="sr-only"
    tabindex="-1"
    aria-label="Choose local files"
    type="file"
    accept={MEDIA_ACCEPT}
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
  <p role="alert">{workspace.error}</p>
{/if}
<div
  class="desktop-composer surface"
  class:collapsed={!expanded}
  data-testid="composer"
>
  {#if !expanded}
    <button
      class="start-writing"
      disabled={!mounted}
      onfocus={expand}
      onclick={expand}>Write a note…</button
    >
  {:else}<div hidden={editorOpen} inert={editorOpen}>
      {@render editor(false)}
    </div>{/if}
</div>
<button
  class="mobile-compose primary"
  disabled={!mounted}
  onclick={() => {
    editorOpen = true;
  }}
>
  {text ? 'Continue writing' : 'Compose a note'}
</button>
<Modal
  bind:open={editorOpen}
  title="Write a note"
  kind="editor"
  customHeader
  dismissible={!workspace?.posting && !workspace?.busy}
  onDismiss={() => {
    if (!desktop && workspace) {
      editorOpen = true;
      void workspace.promptUnsavedChanges().then((proceed) => {
        if (proceed) editorOpen = false;
      });
    }
  }}
>
  {#if editorOpen}{@render editor(true)}{/if}
</Modal>

{#if workspace}
  <Modal
    bind:open={workspace.confirmModalOpen}
    title="Unsaved changes"
    onDismiss={() => workspace.cancelConfirm()}
    dismissible={!workspace.posting}
  >
    <p>
      You have unsaved changes. Do you want to post/save your changes, discard
      them, or cancel?
    </p>
    {#if workspace.frozen}<p>
        This save may already have succeeded. Discard only abandons this editor;
        it does not undo a server save.
      </p>{/if}
    {#if workspace.postError}<p role="alert">{workspace.postError}</p>{/if}
    <div class="confirm-actions">
      <button
        class="primary"
        disabled={!workspace.canPost}
        onclick={() => void workspace.confirmSaveAndProceed()}
      >
        {workspace.active?.kind === 'edit' ? 'Save changes' : 'Post'}
      </button>
      <button
        class="danger"
        disabled={workspace.busy || workspace.posting}
        onclick={() => workspace.confirmDiscard()}
      >
        Discard
      </button>
      <button
        type="button"
        disabled={workspace.posting}
        onclick={() => workspace.cancelConfirm()}
      >
        Cancel
      </button>
    </div>
  </Modal>
{/if}

<style>
  .desktop-composer {
    padding: 0;
  }
  .desktop-composer.collapsed {
    padding: var(--space-3);
  }
  .start-writing {
    width: 100%;
    text-align: left;
    color: var(--muted);
    border: 0;
  }
  .editor-container {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius);
  }
  .editor-container:focus-within {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .editor-container:has(textarea:focus-visible) {
    outline: var(--focus-width) solid var(--accent);
    outline-offset: calc(-1 * var(--focus-width));
  }
  .focus-editor {
    flex: 1;
  }
  .focus-control {
    width: var(--target);
    padding: 0;
    border: 0;
    color: var(--muted);
    margin-left: auto;
  }
  .focus-control svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: middle;
  }
  textarea,
  .preview-pane {
    padding: var(--space-3) var(--space-3) var(--space-2);
    min-height: 5rem;
    width: 100%;
  }
  textarea {
    display: block;
    border: 0;
    border-radius: 0;
    resize: none;
    height: 10rem;
  }
  textarea:focus-visible {
    outline: none;
  }
  .preview-pane {
    overflow: auto;
  }
  .compact-preview {
    height: 10rem;
  }
  .expanded-text,
  .expanded-preview {
    flex: 1;
    height: auto;
  }
  .help {
    margin: 0;
    padding: 0 var(--space-3);
    font-size: 0.75rem;
  }
  .editor-footer {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: none;
    flex-wrap: wrap;
    padding: var(--space-1);
  }
  .editor-footer .primary {
    margin-left: var(--space-1);
  }
  .preview-switch {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: 0;
    font-size: 0.875rem;
    padding-inline: var(--space-2);
    color: var(--muted);
  }
  .switch-track {
    display: flex;
    align-items: center;
    width: 1.875rem;
    height: 1.125rem;
    padding: 2px;
    border: 1px solid var(--control-border);
    border-radius: 1rem;
  }
  .switch-track span {
    width: 0.75rem;
    height: 0.75rem;
    background: var(--muted);
    border-radius: 50%;
  }
  .preview-switch[aria-checked='true'] .switch-track {
    background: var(--accent);
    border-color: var(--accent);
    justify-content: flex-end;
  }
  .preview-switch[aria-checked='true'] .switch-track span {
    background: var(--on-accent);
  }
  .mobile-compose {
    display: none;
  }
  .confirm-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    justify-content: flex-end;
  }
  @media (max-width: 899px) {
    .desktop-composer {
      display: none;
    }
    .mobile-compose {
      display: block;
      min-width: var(--target);
    }
    .expanded-text,
    .expanded-preview {
      min-height: 3.5rem;
    }
  }
</style>
