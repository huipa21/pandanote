<script lang="ts">
  import { untrack, getContext } from 'svelte';
  import Modal from './Modal.svelte';
  import Markdown from './Markdown.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import LabelChip from './LabelChip.svelte';
  import { LABELS, type LabelsMap } from '#lib/client/labels-context.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendTemplateCommand } from '#lib/client/templates/api.ts';
  import type {
    NoteTemplate,
    TemplateCommand,
    TemplateMutationResult,
  } from '#lib/shared/templates.ts';

  /** Create (template null) or edit one template. Lives outside the note editor. */
  let {
    open = $bindable(false),
    template = null,
    onSaved = () => {},
  }: {
    open?: boolean;
    template?: NoteTemplate | null;
    onSaved?: (result: TemplateMutationResult) => void;
  } = $props();

  const i18n = useI18n();
  const t = i18n.t;
  const formId = $props.id();
  const nameId = `${formId}-name`;
  const bodyId = `${formId}-body`;
  const labelsMap = getContext<LabelsMap | undefined>(LABELS);

  let name = $state('');
  let body = $state('');
  let labelId = $state<string | null>(null);
  let initialName = '';
  let initialBody = '';
  let initialLabelId: string | null = null;
  let labelPickerOpen = $state(false);
  let preview = $state(false);
  let busy = $state(false);
  let error = $state('');
  let conflict = $state(false);
  let confirmDiscard = $state(false);
  // A retry of the same content reuses its mutation ID, so a lost response cannot
  // create or change a template twice. Any edit starts a new identity.
  let mutationId: string | null = null;
  let identityKey = '';

  const dirty = $derived(
    name !== initialName || body !== initialBody || labelId !== initialLabelId,
  );
  const currentLabel = $derived(labelId ? labelsMap?.get(labelId) : undefined);

  // Each real opening starts from the chosen template (or a blank create form). A
  // reopen to show the discard prompt must keep the typed text.
  let wasOpen = false;
  $effect(() => {
    const isOpen = open;
    const source = template;
    untrack(() => {
      if (isOpen && !wasOpen) {
        initialName = source?.name ?? '';
        initialBody = source?.bodyMarkdown ?? '';
        initialLabelId = source?.labelId ?? null;
        name = initialName;
        body = initialBody;
        labelId = initialLabelId;
        preview = false;
        error = '';
        conflict = false;
        confirmDiscard = false;
        mutationId = null;
        identityKey = '';
      }
      wasOpen = isOpen;
    });
  });

  function dismissRequest() {
    if (busy) return;
    if (dirty) {
      confirmDiscard = true;
      open = true;
      return;
    }
    open = false;
  }

  function discard() {
    confirmDiscard = false;
    open = false;
  }

  async function save() {
    if (busy) return;
    const key = JSON.stringify([
      template?.id,
      template?.revision,
      name,
      body,
      labelId,
    ]);
    if (!mutationId || key !== identityKey) {
      mutationId = crypto.randomUUID();
      identityKey = key;
    }
    const command: TemplateCommand = template
      ? {
          action: 'update',
          mutationId,
          templateId: template.id,
          expectedRevision: template.revision,
          name,
          bodyMarkdown: body,
          labelId,
        }
      : { action: 'create', mutationId, name, bodyMarkdown: body, labelId };
    busy = true;
    error = '';
    conflict = false;
    try {
      const result = await sendTemplateCommand(command);
      if (!result.ok) {
        conflict = result.error.code === 'conflict';
        error = i18n.error(result.error);
        return;
      }
      initialName = name;
      initialBody = body;
      initialLabelId = labelId;
      open = false;
      onSaved(result.data);
    } catch {
      error = t('err.templateSaveFailed');
    } finally {
      busy = false;
    }
  }
</script>

<Modal
  bind:open
  title={template ? t('templates.editTitle') : t('templates.newTitle')}
  dismissible={!busy}
  onDismiss={dismissRequest}
>
  <form
    class="template-form"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <label for={nameId}>{t('templates.name')}</label>
    <input
      id={nameId}
      type="text"
      maxlength={240}
      autocomplete="off"
      bind:value={name}
      disabled={busy}
      data-initial-focus
    />
    <div class="body-head">
      <label for={bodyId}>{t('templates.body')}</label>
      <button
        type="button"
        class="preview-toggle"
        aria-pressed={preview}
        disabled={busy}
        onclick={() => (preview = !preview)}>{t('editor.preview')}</button
      >
    </div>
    <div class="label-row">
      <span class="field-label">{t('templates.label')}</span>
      <button
        type="button"
        class="label-trigger"
        disabled={busy}
        aria-label={currentLabel
          ? `${t('labels.pick')}: ${currentLabel.name}`
          : t('editor.addLabel')}
        onclick={() => (labelPickerOpen = true)}
      >
        {#if currentLabel}<LabelChip label={currentLabel} />
        {:else}<span class="no-label">{t('editor.addLabel')}</span>{/if}
      </button>
    </div>
    {#if preview}
      <div class="preview" aria-label={t('templates.body')}>
        <Markdown source={body} images={[]} debounce={300} />
      </div>
    {:else}
      <textarea
        id={bodyId}
        rows="8"
        bind:value={body}
        disabled={busy}
        spellcheck="false"></textarea>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if conflict}<p class="help">{t('templates.reloadHint')}</p>{/if}
    {#if confirmDiscard}
      <div
        class="confirm"
        role="group"
        aria-label={t('templates.discardQuestion')}
      >
        <span>{t('templates.discardQuestion')}</span>
        <button type="button" class="danger" onclick={discard}
          >{t('unsaved.discard')}</button
        >
        <button
          type="button"
          data-initial-focus
          onclick={() => (confirmDiscard = false)}
          >{t('templates.keepEditing')}</button
        >
      </div>
    {/if}
    <div class="actions">
      <button type="button" disabled={busy} onclick={dismissRequest}
        >{t('note.cancel')}</button
      >
      <button
        type="submit"
        class="primary"
        disabled={busy || !name.trim() || !body.trim()}
        >{busy ? t('templates.saving') : t('templates.save')}</button
      >
    </div>
  </form>
</Modal>
<LabelPicker
  bind:open={labelPickerOpen}
  current={labelId}
  onPick={(picked) => (labelId = picked)}
/>

<style>
  .template-form {
    display: grid;
    gap: var(--space-2);
  }
  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
  }
  textarea {
    min-height: 10rem;
    resize: vertical;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.9375rem;
  }
  .body-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .field-label {
    font-size: 0.875rem;
    color: var(--muted);
  }
  .label-trigger {
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
  }
  .no-label {
    color: var(--muted);
    font-size: 0.875rem;
    text-decoration: underline;
  }
  .preview-toggle {
    min-height: var(--target);
  }
  .preview {
    min-height: 10rem;
    max-height: min(24rem, 50vh);
    overflow: auto;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .confirm,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .confirm {
    justify-content: flex-start;
  }
  p {
    margin: 0;
  }
  .help {
    font-size: 0.875rem;
    color: var(--muted);
  }
</style>
