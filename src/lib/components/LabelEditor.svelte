<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { sendLabelCommand } from '#lib/client/labels/api.ts';
  import {
    LABEL_COLORS,
    LABEL_ICONS,
    LABEL_FONTS,
    type LabelColor,
    type LabelCommand,
    type LabelFont,
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
  let headerColor = $state<LabelColor | null>(null);
  let background = $state<LabelColor | null>(null);
  let font = $state<LabelFont | null>(null);
  let initialName = '';
  let initialColor: LabelColor = 'blue';
  let initialIcon: LabelIcon | null = null;
  let initialHeaderColor: LabelColor | null = null;
  let initialBackground: LabelColor | null = null;
  let initialFont: LabelFont | null = null;
  let busy = $state(false);
  let error = $state('');
  let conflict = $state(false);
  let confirmDiscard = $state(false);
  let mutationId: string | null = null;
  let identityKey = '';

  const dirty = $derived(
    name !== initialName ||
      color !== initialColor ||
      icon !== initialIcon ||
      headerColor !== initialHeaderColor ||
      background !== initialBackground ||
      font !== initialFont,
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
        initialHeaderColor = source?.headerColor ?? null;
        initialBackground = source?.background ?? null;
        initialFont = source?.font ?? null;
        name = initialName;
        color = initialColor;
        icon = initialIcon;
        headerColor = initialHeaderColor;
        background = initialBackground;
        font = initialFont;
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
      label?.id,
      label?.revision,
      name,
      color,
      icon,
      headerColor,
      background,
      font,
    ]);
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
          headerColor,
          background,
          font,
        }
      : {
          action: 'create',
          mutationId,
          name,
          color,
          icon,
          headerColor,
          background,
          font,
        };
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
      initialHeaderColor = headerColor;
      initialBackground = background;
      initialFont = font;
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
    <span id={`${formId}-header-label`}>{t('labels.headerColor')}</span>
    <div
      class="swatches"
      role="radiogroup"
      aria-labelledby={`${formId}-header-label`}
    >
      <button
        type="button"
        class="swatch none"
        role="radio"
        aria-checked={headerColor === null}
        aria-label={t('labels.noHeaderColor')}
        disabled={busy}
        onclick={() => (headerColor = null)}>—</button
      >
      {#each LABEL_COLORS as key (key)}
        <button
          type="button"
          class="swatch"
          style:--label-bg={`var(--label-${key}-bg)`}
          style:--label-fg={`var(--label-${key}-fg)`}
          role="radio"
          aria-checked={headerColor === key}
          aria-label={t(`labels.color.${key}` as MessageKey)}
          disabled={busy}
          onclick={() => (headerColor = key)}
        ></button>
      {/each}
    </div>
    <span id={`${formId}-background-label`}>{t('labels.background')}</span>
    <div
      class="swatches"
      role="radiogroup"
      aria-labelledby={`${formId}-background-label`}
    >
      <button
        type="button"
        class="swatch none"
        role="radio"
        aria-checked={background === null}
        aria-label={t('labels.noBackground')}
        disabled={busy}
        onclick={() => (background = null)}>—</button
      >
      {#each LABEL_COLORS as key (key)}
        <button
          type="button"
          class="swatch"
          style:--label-bg={`var(--label-${key}-bg)`}
          style:--label-fg={`var(--label-${key}-fg)`}
          role="radio"
          aria-checked={background === key}
          aria-label={t(`labels.color.${key}` as MessageKey)}
          disabled={busy}
          onclick={() => (background = key)}
        ></button>
      {/each}
    </div>
    <span id={`${formId}-font-label`}>{t('labels.font')}</span>
    <div
      class="fonts"
      role="radiogroup"
      aria-labelledby={`${formId}-font-label`}
    >
      <button
        type="button"
        class="font-choice"
        role="radio"
        aria-checked={font === null}
        disabled={busy}
        onclick={() => (font = null)}>{t('labels.font.default')}</button
      >
      {#each LABEL_FONTS as key (key)}
        <button
          type="button"
          class="font-choice"
          style:font-family={`var(--font-${key === 'mono' ? 'code' : key})`}
          role="radio"
          aria-checked={font === key}
          disabled={busy}
          onclick={() => (font = key)}
          >{t(`labels.font.${key}` as MessageKey)}</button
        >
      {/each}
    </div>
    <span>{t('labels.pick')}</span>
    <div
      class="preview-card"
      style:--label-bg={`var(--label-${color}-bg)`}
      style:--label-fg={`var(--label-${color}-fg)`}
      style:background={background
        ? `var(--label-${background}-bg)`
        : 'var(--surface)'}
    >
      <div
        class="preview-header"
        style:background={headerColor
          ? `var(--label-${headerColor}-bg)`
          : 'transparent'}
        style:color={headerColor ? `var(--label-${headerColor}-fg)` : 'inherit'}
      >
        <span class="preview-chip"
          >{#if icon}<Icon name={icon as IconName} />{/if}<span
            >{name || t('labels.name')}</span
          ></span
        >
      </div>
      <p
        class="preview-body"
        style:font-family={font
          ? `var(--font-${font === 'mono' ? 'code' : font})`
          : 'var(--font-body)'}
      >
        {t('labels.previewBody')}
      </p>
    </div>
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
  .icons,
  .fonts {
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
  .swatch.none {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border-color: var(--border);
    color: var(--muted);
  }
  .swatch[aria-checked='true'] {
    border-color: var(--label-fg);
  }
  .swatch.none[aria-checked='true'] {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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
  .font-choice {
    padding: var(--space-1) var(--space-3);
    min-height: var(--target);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
  }
  .font-choice[aria-checked='true'] {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .preview-card {
    justify-self: start;
    display: grid;
    width: 100%;
    max-width: 20rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .preview-header {
    padding: var(--space-2) var(--space-3);
  }
  .preview-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    background: var(--label-bg);
    color: var(--label-fg);
    font-weight: 600;
  }
  .preview-body {
    margin: 0;
    padding: var(--space-2) var(--space-3);
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
