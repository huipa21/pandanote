<script lang="ts">
  import { tick, getContext, onMount, untrack } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import EditorFeedback from './EditorFeedback.svelte';
  import AttachmentGrid from './AttachmentGrid.svelte';
  import AudioClipList from './AudioClipList.svelte';
  import FileAttachmentList from './FileAttachmentList.svelte';
  import VoiceRecorder from './VoiceRecorder.svelte';
  import TagAutocomplete from './TagAutocomplete.svelte';
  import EditorOptions from './EditorOptions.svelte';
  import Modal from './Modal.svelte';
  import Markdown from './Markdown.svelte';
  import TemplatePicker from './TemplatePicker.svelte';
  import { tr } from '#lib/client/i18n-current.ts';
  import {
    insertTemplateText,
    type NoteTemplate,
  } from '#lib/shared/templates.ts';
  import { MEDIA_ACCEPT } from '#lib/client/uploads/file-kind.ts';

  /**
   * The editor body for the workspace's single in-memory session: used by the top
   * composer (new notes) and in place on a note card or note page (edits).
   */
  let {
    variant,
    showInline = true,
    focusOpen = $bindable(false),
    localText = $bindable(''),
    onClose = () => {},
  }: {
    variant: 'composer' | 'inline';
    /** Render the inline body. The focus-mode dialog is always available. */
    showInline?: boolean;
    /** Full-screen focus mode for the same session. */
    focusOpen?: boolean;
    /** Text kept in component memory when no editor workspace exists (fixtures). */
    localText?: string;
    /** Called after an inline edit is cancelled/discarded. */
    onClose?: () => void;
  } = $props();

  const { t } = useI18n();
  const workspace = getContext<EditorWorkspace | undefined>(EDITOR_WORKSPACE);
  let preview = $state(false);
  let text = $derived(
    workspace ? (workspace.active?.bodyMarkdown ?? '') : localText,
  );
  let fileInput = $state<HTMLInputElement>(null!);
  let attachInput = $state<HTMLInputElement>(null!);
  let cursor = { start: 0, end: 0 };
  let textarea = $state<HTMLTextAreaElement>();
  let expandedTextarea = $state<HTMLTextAreaElement>();
  let desktop = $state(false);
  let confirmCancel = $state(false);
  let templatePickerOpen = $state(false);
  const dialogTitle = $derived(
    variant === 'inline' ? t('editor.editNote') : t('editor.writeNote'),
  );

  /** Move keyboard focus into the inline text area. */
  export async function focusText() {
    await tick();
    textarea?.focus();
  }

  /**
   * Grows the inline (compact) text area with its content. CSS max-height caps the
   * growth; past the cap the text area scrolls instead.
   */
  function autoGrow(node: HTMLTextAreaElement, value: string) {
    // The value triggers Svelte's update callback; fitting reads the rendered DOM.
    void value;
    const fit = () => {
      if (!node.classList.contains('compact-text')) return;
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    };
    const onResize = () => fit();
    fit();
    window.addEventListener('resize', onResize);
    return {
      update: fit,
      destroy: () => window.removeEventListener('resize', onResize),
    };
  }
  function changed(event: Event) {
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    if (workspace) workspace.change(value);
    else localText = value;
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
  /**
   * Inserts a template at the caret of the current session text. Nothing posts; the
   * usual Post/Save rules apply. A violation of the Markdown size limit adds nothing.
   */
  async function insertTemplate(template: NoteTemplate) {
    if (
      !workspace?.active ||
      !workspace.ready ||
      workspace.busy ||
      workspace.frozen ||
      workspace.conflict ||
      workspace.posting ||
      workspace.recording
    )
      return;
    const next = insertTemplateText(
      workspace.active.bodyMarkdown,
      cursor.start,
      cursor.end,
      template.bodyMarkdown,
    );
    if (
      new TextEncoder().encode(next.text).byteLength >
      workspace.limits.markdownMaxBytes
    ) {
      workspace.error = tr('templates.tooLarge');
      return;
    }
    workspace.change(next.text);
    preview = false;
    cursor = { start: next.caret, end: next.caret };
    await tick();
    const input = focusOpen ? expandedTextarea : textarea;
    input?.setSelectionRange(next.caret, next.caret);
  }

  async function handleCloseEditor(focus: boolean) {
    if (!workspace) {
      focusOpen = !focus;
      return;
    }
    if (!focus) {
      focusOpen = true;
      return;
    }
    // On mobile the composer's focus mode is its only visible editor, so closing
    // it asks about unsaved text. Inline edits just return to the card/page.
    if (
      variant === 'inline' ||
      desktop ||
      (await workspace.promptUnsavedChanges())
    )
      focusOpen = false;
  }
  function cancel() {
    if (!workspace || workspace.busy || workspace.posting) return;
    if (workspace.dirty || workspace.frozen) {
      confirmCancel = true;
      return;
    }
    close();
  }
  function close() {
    confirmCancel = false;
    focusOpen = false;
    void workspace?.discard().then((done) => {
      if (done) onClose();
    });
  }

  onMount(() => {
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
  const sessionId = $derived(workspace?.active?.localId);
  $effect(() => {
    void sessionId;
    if (untrack(() => workspace?.status === 'saved')) focusOpen = false;
    preview = false;
    cursor = { start: 0, end: 0 };
    confirmCancel = false;
    templatePickerOpen = false;
  });
  $effect(() => {
    const visible = preview && (focusOpen || showInline);
    if (workspace?.ready) untrack(() => workspace.setPreviewVisible(visible));
  });
  $effect(() => {
    if (workspace || !text) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  $effect(() => {
    if (!workspace?.dirty && !workspace?.frozen) confirmCancel = false;
  });
</script>

{#snippet postButton()}
  <button
    class="primary"
    disabled={!workspace?.canPost}
    onclick={() => workspace?.post()}
  >
    {workspace?.recording
      ? workspace.postBlockedReason
      : workspace?.posting
        ? t('editor.saving')
        : workspace?.frozen
          ? t('editor.retrySave')
          : workspace?.active?.kind === 'edit'
            ? t('unsaved.saveChanges')
            : t('unsaved.post')}
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
        {#if focus || !focusOpen}<Markdown
            source={text}
            images={workspace?.images ?? []}
            debounce={300}
          />{/if}
      </div>
    {:else}
      <label
        class="sr-only"
        for={focus ? 'expanded-note-text' : 'compact-note-text'}
        >{t('editor.noteText')}</label
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
        class:compact-text={!focus}
        use:autoGrow={focus ? '' : text}
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
        aria-describedby={focus ? 'expanded-help' : 'composer-help'}></textarea>
      {#if workspace}<TagAutocomplete
          textarea={focus ? expandedTextarea : textarea}
          {workspace}
        />{/if}
    {/if}
    {#if workspace}<AttachmentGrid {workspace} /><AudioClipList
        {workspace}
      /><FileAttachmentList {workspace} /><EditorFeedback {workspace} />{/if}
    <p class="help" id={focus ? 'expanded-help' : 'composer-help'}>
      {#if workspace}<span role="status"
          >{workspace.active?.kind === 'edit'
            ? t('editor.editingStatus')
            : ''}</span
        >
      {:else}{t('editor.notSaved')}{/if}
    </p>
    {#if confirmCancel && !focus}
      <div
        class="cancel-confirm"
        role="group"
        aria-label={t('editor.discardGroup')}
      >
        <span>{t('editor.discardText')}</span>
        <button
          type="button"
          class="danger"
          disabled={workspace?.busy || workspace?.posting}
          onclick={close}>{t('unsaved.discard')}</button
        >
        <button
          type="button"
          onclick={() => {
            confirmCancel = false;
            void focusText();
          }}>{t('editor.keepEditing')}</button
        >
      </div>
    {/if}
    {#if workspace}<VoiceRecorder {workspace} />{/if}
    <div class="editor-footer">
      <EditorOptions
        {workspace}
        onTemplate={() => (templatePickerOpen = true)}
        onFiles={() => fileInput.click()}
        onAttach={() => attachInput.click()}
      />
      <button
        class="preview-switch"
        type="button"
        role="switch"
        aria-label={t('editor.preview')}
        aria-checked={preview}
        onclick={() => {
          preview = !preview;
        }}
        title={preview ? t('editor.showRaw') : t('editor.previewMarkdown')}
        ><span class="switch-track" aria-hidden="true"><span></span></span>{t(
          'editor.preview',
        )}</button
      >
      <button
        class="focus-control"
        type="button"
        aria-label={focus
          ? `${t('modal.closeNamed', { title: dialogTitle })}`
          : t('editor.enterFocus')}
        title={focus ? t('editor.closeFocus') : t('editor.focusMode')}
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
      {#if variant === 'inline' && !focus}<button
          type="button"
          class="cancel"
          disabled={workspace?.busy || workspace?.posting}
          onclick={cancel}>{t('note.cancel')}</button
        >{/if}
      {@render postButton()}
    </div>
  </div>
{/snippet}

{#if workspace}
  <input
    class="sr-only"
    tabindex="-1"
    aria-label={t('editor.chooseFiles')}
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
  <input
    class="sr-only"
    tabindex="-1"
    aria-label={t('editor.chooseAnyFile')}
    type="file"
    multiple
    disabled={!workspace.ready || workspace.busy || workspace.frozen}
    bind:this={attachInput}
    onchange={(event) => {
      addFiles(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = '';
    }}
  />
{/if}
{#if variant === 'composer' && workspace?.error && workspace.editOrigin === null && !focusOpen && (!desktop || !showInline)}
  <p role="alert">{workspace.error}</p>
{/if}
{#if showInline}
  <div
    class="note-editor"
    class:composer={variant === 'composer'}
    class:surface={variant === 'composer'}
    data-testid={variant === 'composer' ? 'composer' : 'inline-editor'}
    hidden={focusOpen}
    inert={focusOpen}
  >
    {@render editor(false)}
  </div>
{/if}
<Modal
  bind:open={focusOpen}
  title={dialogTitle}
  kind="editor"
  customHeader
  dismissible={!workspace?.posting && !workspace?.busy}
  onDismiss={() => {
    if (variant === 'composer' && !desktop && workspace) {
      focusOpen = true;
      void workspace.promptUnsavedChanges().then((proceed) => {
        if (proceed) focusOpen = false;
      });
    }
  }}
>
  {#if focusOpen}{@render editor(true)}{/if}
</Modal>
{#if workspace}<TemplatePicker
    bind:open={templatePickerOpen}
    onPick={(template) => void insertTemplate(template)}
  />{/if}

<style>
  .note-editor.composer {
    padding: 0;
  }
  .editor-container {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius);
  }
  /* Outline (not inset shadow) so the opaque textarea cannot hide the top edge. */
  .editor-container:focus-within {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
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
  /* Inline editor: grows with the text up to a cap, then scrolls. */
  textarea.compact-text {
    min-height: 10rem;
    max-height: min(24rem, 60vh);
    overflow-y: auto;
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
  .cancel-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
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
  .editor-footer .cancel {
    border: 0;
    color: var(--muted);
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
  @media (max-width: 899px) {
    /* On small screens the top composer is only reachable through its button
       and the focus-mode dialog; inline edits stay visible at every width. */
    .note-editor.composer {
      display: none;
    }
    .expanded-text,
    .expanded-preview {
      min-height: 3.5rem;
    }
  }
</style>
