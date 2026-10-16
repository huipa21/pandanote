<script lang="ts">
  import { untrack, getContext } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { loadLabels, sendLabelCommand } from '#lib/client/labels/api.ts';
  import { LABELS, type LabelsMap } from '#lib/client/labels-context.ts';
  import {
    LABEL_COLORS,
    normalizeLabelName,
    type LabelSummary,
  } from '#lib/shared/labels.ts';

  /** Choose at most one label for the current note. Fetched fresh each opening, so
   * a label deleted elsewhere does not appear. */
  let {
    open = $bindable(false),
    current = null,
    onPick,
  }: {
    open?: boolean;
    current?: string | null;
    onPick: (labelId: string | null) => void;
  } = $props();

  const i18n = useI18n();
  const t = i18n.t;
  // Optional: not every host provides the sidebar/card label cache (e.g. the
  // Templates page's picker). When present, a quick-created label is added to
  // it immediately so its chip renders without a full page data reload.
  const labelsMap = getContext<LabelsMap | undefined>(LABELS);

  let items = $state<LabelSummary[]>([]);
  let loading = $state(false);
  let error = $state('');
  let wasOpen = false;
  let newName = $state('');
  let creating = $state(false);
  let createError = $state('');

  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen && !wasOpen) {
        void load();
        newName = '';
        createError = '';
      }
      wasOpen = isOpen;
    });
  });

  async function load() {
    loading = true;
    error = '';
    try {
      const result = await loadLabels();
      if (result.ok) items = result.data.items;
      else error = i18n.error(result.error);
    } catch {
      error = t('labels.loadFailed');
    } finally {
      loading = false;
    }
  }

  function choose(labelId: string | null) {
    open = false;
    onPick(labelId);
  }

  /** Creates a label with a rotating default color (no icon/overrides — those can be
   * refined later on the Labels page) and immediately selects it for this note. */
  async function createAndPick() {
    if (creating) return;
    const name = normalizeLabelName(newName);
    if (name === null) {
      createError = t('err.labelNameInvalid');
      return;
    }
    creating = true;
    createError = '';
    const color = LABEL_COLORS[items.length % LABEL_COLORS.length];
    try {
      const result = await sendLabelCommand({
        action: 'create',
        mutationId: crypto.randomUUID(),
        name,
        color,
        icon: null,
        headerColor: null,
        background: null,
        font: null,
      });
      if (!result.ok) {
        createError = i18n.error(result.error);
        return;
      }
      newName = '';
      const created: LabelSummary = {
        id: result.data.labelId,
        name,
        color,
        icon: null,
        headerColor: null,
        background: null,
        font: null,
        revision: result.data.revision,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        noteCount: 0,
      };
      labelsMap?.set(created.id, created);
      choose(created.id);
    } catch {
      createError = t('err.labelSaveFailed');
    } finally {
      creating = false;
    }
  }
</script>

<Modal bind:open title={t('labels.pickTitle')} kind="panel">
  <div class="picker">
    {#if error}<p role="alert">{error}</p>{/if}
    <ul class="choices">
      <li>
        <button
          type="button"
          class="choice"
          class:active={current === null}
          onclick={() => choose(null)}>{t('labels.noLabel')}</button
        >
      </li>
      {#each items as item (item.id)}
        <li>
          <button
            type="button"
            class="choice"
            class:active={current === item.id}
            style:--label-bg={`var(--label-${item.color}-bg)`}
            style:--label-fg={`var(--label-${item.color}-fg)`}
            onclick={() => choose(item.id)}
            >{#if item.icon}<Icon name={item.icon as IconName} />{/if}<span
              >{item.name}</span
            ></button
          >
        </li>
      {/each}
    </ul>
    {#if !loading && !error && !items.length}
      <p class="help">{t('labels.pickerNone')}</p>
    {/if}
    <form
      class="quick-create"
      onsubmit={(event) => {
        event.preventDefault();
        void createAndPick();
      }}
    >
      <label class="sr-only" for="label-quick-create-name"
        >{t('labels.quickCreatePlaceholder')}</label
      >
      <input
        id="label-quick-create-name"
        type="text"
        maxlength={40}
        autocomplete="off"
        placeholder={t('labels.quickCreatePlaceholder')}
        disabled={creating}
        bind:value={newName}
      />
      <button type="submit" disabled={creating || !newName.trim()}
        >{creating
          ? t('labels.quickCreating')
          : t('labels.quickCreateButton')}</button
      >
    </form>
    {#if createError}<p role="alert">{createError}</p>{/if}
    <a class="manage" href="/labels">{t('labels.manage')}</a>
  </div>
</Modal>

<style>
  .picker {
    display: grid;
    gap: var(--space-2);
  }
  .choices {
    display: grid;
    gap: var(--space-1);
    max-height: min(24rem, 60vh);
    overflow: auto;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--target);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--label-bg, var(--surface));
    color: var(--label-fg, inherit);
    text-align: start;
    cursor: pointer;
  }
  .choice.active {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .choice:hover,
  .choice:focus-visible {
    filter: brightness(0.97);
  }
  .quick-create {
    display: flex;
    gap: var(--space-2);
  }
  .quick-create input {
    flex: 1;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
    font: inherit;
  }
  .quick-create button {
    min-height: var(--target);
    white-space: nowrap;
  }
  .manage {
    justify-self: start;
    color: var(--accent);
  }
  p {
    margin: 0;
  }
  .help {
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
