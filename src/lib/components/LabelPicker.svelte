<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { loadLabels } from '#lib/client/labels/api.ts';
  import type { LabelSummary } from '#lib/shared/labels.ts';

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

  let items = $state<LabelSummary[]>([]);
  let loading = $state(false);
  let error = $state('');
  let wasOpen = false;

  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen && !wasOpen) void load();
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
