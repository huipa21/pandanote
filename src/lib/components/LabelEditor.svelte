<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendLabelCommand } from '#lib/client/labels/api.ts';
  import {
    LABEL_COLORS,
    LABEL_ICONS,
    type LabelColor,
    type LabelCommand,
    type LabelIcon,
    type LabelMutationResult,
    type NoteLabel,
  } from '#lib/shared/labels.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';

  /** Create (label null) or edit one label. Lives outside the note editor. */
  let {
    open = $bindable(false),
    label = null,
    onSaved = () => {},
  }: {
    open?: boolean;
    label?: NoteLabel | null;
    onSaved?: (result: LabelMutationResult) => void;
  } = $props();

  const i18n = useI18n();
  const t = i18n.t;
  const formId = $props.id();
  const nameId = `${formId}-name`;

  let name = $state('');
  let color = $state<LabelColor>('blue');
  let icon = $state<LabelIcon | null>(null);
  let initialName = '';
  let initialColor: LabelColor = 'blue';
  let initialIcon: LabelIcon | null = null;
  let busy = $state(false);
  let error = $state('');
  let conflict = $state(false);
  let confirmDiscard = $state(false);
  let mutationId: string | null = null;
  let identityKey = '';

  const dirty = $derived(
    name !== initialName || color !== initialColor || icon !== initialIcon,
  );

  let wasOpen = false;
  $effect(() => {
    const isOpen = open;
    const source = label;
    untrack(() => {
      if (isOpen && !wasOpen) {
        initialName = source?.name ?? '';
        initialColor = source?.color ?? 'blue';
        initialIcon = source?.icon ?? null;
        name = initialName;
        color = initialColor;
        icon = initialIcon;
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
    const key = JSON.stringify([label?.id, label?.revision, name, color, icon]);
    if (!mutationId || key !== identityKey) {
      mutationId = crypto.randomUUID();
      identityKey = key;
    }
    const command: LabelCommand = label
      ? {
          action: 'update',
          mutationId,
          labelId: label.id,
          expectedRevision: label.revision,
          name,
          color,
          icon,
        }
      : { action: 'create', mutationId, name, color, icon };
    busy = true;
    error = '';
    conflict = false;
    try {
      const result = await sendLabelCommand(command);
      if (!result.ok) {
        conflict = result.error.code === 'conflict';
        error = i18n.error(result.error);
        return;
      }
      initialName = name;
      initialColor = color;
      initialIcon = icon;
      open = false;
      onSaved(result.data);
    } catch {
      error = t('err.labelSaveFailed');
    } finally {
      busy = false;
    }
  }
</script>

<Modal
  bind:open
  title={label ? t('labels.editTitle') : t('labels.newTitle')}
  dismissible={!busy}
  onDismiss={dismissRequest}
>
  <form
    class="label-form"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <label for={nameId}>{t('labels.name')}</label>
    <input
      id={nameId}
      type="text"
      maxlength={240}
      autocomplete="off"
      bind:value={name}
      disabled={busy}
      data-initial-focus
    />
    <span id={`${formId}-color-label`}>{t('labels.color')}</span>
    <div
      class="swatches"
      role="radiogroup"
      aria-labelledby={`${formId}-color-label`}
    >
      {#each LABEL_COLORS as key (key)}
        <button
          type="button"
          class="swatch"
          style:--label-bg={`var(--label-${key}-bg)`}
          style:--label-fg={`var(--label-${key}-fg)`}
          role="radio"
          aria-checked={color === key}
          aria-label={t(`labels.color.${key}` as MessageKey)}
          disabled={busy}
          onclick={() => (color = key)}
        ></button>
      {/each}
    </div>
    <span id={`${formId}-icon-label`}>{t('labels.icon')}</span>
    <div
      class="icons"
      role="radiogroup"
      aria-labelledby={`${formId}-icon-label`}
    >
      <button
        type="button"
        class="icon-choice"
        role="radio"
        aria-checked={icon === null}
        aria-label={t('labels.noIcon')}
        disabled={busy}
        onclick={() => (icon = null)}>—</button
      >
      {#each LABEL_ICONS as key (key)}
        <button
          type="button"
          class="icon-choice"
          role="radio"
          aria-checked={icon === key}
          aria-label={t(`labels.icon.${key}` as MessageKey)}
          disabled={busy}
          onclick={() => (icon = key)}><Icon name={key as IconName} /></button
        >
      {/each}
    </div>
    <span>{t('labels.pick')}</span>
    <span
      class="preview"
      style:--label-bg={`var(--label-${color}-bg)`}
      style:--label-fg={`var(--label-${color}-fg)`}
      >{#if icon}<Icon name={icon as IconName} />{/if}<span
        >{name || t('labels.name')}</span
      ></span
    >
    {#if error}<p role="alert">{error}</p>{/if}
    {#if conflict}<p class="help">{t('labels.reloadHint')}</p>{/if}
    {#if confirmDiscard}
      <div
        class="confirm"
        role="group"
        aria-label={t('labels.discardQuestion')}
      >
        <span>{t('labels.discardQuestion')}</span>
        <button type="button" class="danger" onclick={discard}
          >{t('unsaved.discard')}</button
        >
        <button
          type="button"
          data-initial-focus
          onclick={() => (confirmDiscard = false)}
          >{t('labels.keepEditing')}</button
        >
      </div>
    {/if}
    <div class="actions">
      <button type="button" disabled={busy} onclick={dismissRequest}
        >{t('note.cancel')}</button
      >
      <button type="submit" class="primary" disabled={busy || !name.trim()}
        >{busy ? t('labels.saving') : t('labels.save')}</button
      >
    </div>
  </form>
</Modal>

<style>
  .label-form {
    display: grid;
    gap: var(--space-2);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
  }
  .swatches,
  .icons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .swatch {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--label-bg);
    padding: 0;
  }
  .swatch[aria-checked='true'] {
    border-color: var(--label-fg);
  }
  .icon-choice {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .icon-choice[aria-checked='true'] {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .preview {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    background: var(--label-bg);
    color: var(--label-fg);
    font-weight: 600;
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
