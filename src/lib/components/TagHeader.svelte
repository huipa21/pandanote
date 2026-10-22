<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import ActionMenu, { type ActionMenuItem } from './ActionMenu.svelte';
  import PendingTagOps from './PendingTagOps.svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import { TagOperations } from '#lib/client/tags/operations.svelte.ts';
  import { VAULT, type VaultControls } from '#lib/client/vault.ts';
  import { tagKey } from '#lib/shared/markdown/tags.ts';
  import type { TagAction, TagExecute, ManagedTag } from '#lib/shared/tags.ts';
  import type { MessageKey } from '#lib/shared/i18n/index.ts';
  import { filterHref } from '#lib/shared/timeline.ts';
  /** `leaveHref` leaves the tag view, keeping any search or day filter. */
  let { summary, leaveHref }: { summary: ManagedTag; leaveHref: string } =
    $props();
  const workspace = getContext<EditorWorkspace>(EDITOR_WORKSPACE);
  const vault = getContext<VaultControls | undefined>(VAULT);
  const ops = new TagOperations(workspace, () => !vault?.open);
  const id = $props.id();
  const t = useI18n().t;
  const LABELS = {
    rename: 'tag.rename',
    merge: 'tag.merge',
    remove: 'tag.remove',
  } as const satisfies Record<TagAction['action'], MessageKey>;
  const ACTIONS = {
    rename: 'tag.actRename',
    merge: 'tag.actMerge',
    remove: 'tag.actRemove',
  } as const satisfies Record<TagAction['action'], MessageKey>;
  let menuTrigger = $state<HTMLButtonElement>();
  let formOpen = $state(false);
  let action = $state<TagAction['action']>('rename');
  let target = $state('');
  onMount(() => ops.start());
  const menuItems = $derived<ActionMenuItem[]>([
    {
      id: 'rename',
      label: t('tag.rename'),
      icon: 'pencil',
      onSelect: () => choose('rename'),
    },
    {
      id: 'merge',
      label: t('tag.merge'),
      icon: 'merge',
      onSelect: () => choose('merge'),
    },
    {
      id: 'remove',
      label: t('tag.remove'),
      icon: 'trash',
      danger: true,
      onSelect: () => choose('remove'),
    },
  ]);
  const choices = $derived.by(() => {
    if (action !== 'merge') return [];
    const needle = tagKey(target.trim().replace(/^#/, ''));
    return workspace.knownTags
      .filter((tag) => tag.key !== summary.key && tag.key.includes(needle))
      .slice(0, 30);
  });
  function choose(next: TagAction['action']) {
    action = next;
    target = next === 'rename' ? summary.display : '';
    ops.reset();
    formOpen = true;
  }
  function operation(): TagAction {
    return {
      source: summary.key,
      action,
      target: action === 'remove' ? null : target.trim().replace(/^#/, ''),
    };
  }
  async function execute(command: TagExecute) {
    const result = await ops.execute(command);
    if (!result) return;
    formOpen = false;
    const { action: done, target: to } = command.operation;
    await goto(done === 'remove' ? '/' : filterHref({ tag: tagKey(to!) }), {
      invalidateAll: true,
    });
  }
  const plural = (n: number, one: MessageKey, many: MessageKey) =>
    t(n === 1 ? one : many, { count: n });
  const meta = $derived(
    [
      plural(summary.published, 'tag.noteOne', 'tag.noteMany'),
      summary.trash ? t('tag.trashCount', { count: summary.trash }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<header class="tag-header">
  <div class="summary">
    <h1>#{summary.display}</h1>
    <p class="meta">{meta}</p>
  </div>
  <a class="leave" href={leaveHref}>{useI18n().t('shell.allNotes')}</a>
  <ActionMenu
    label={t('tag.actions')}
    items={menuItems}
    bind:trigger={menuTrigger}
  />
</header>
<PendingTagOps
  {ops}
  onExecuted={(command) => {
    const { action: done, target: to } = command.operation;
    void goto(done === 'remove' ? '/' : filterHref({ tag: tagKey(to!) }), {
      invalidateAll: true,
    });
  }}
/>

<Modal
  bind:open={formOpen}
  title={t(LABELS[action])}
  dismissible={!ops.busy}
  onDismiss={() => ops.reset()}
>
  {#if !ops.preview}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void ops.showPreview(operation());
      }}
    >
      {#if action === 'remove'}
        <p>#{summary.display}</p>
      {:else}
        <label for={`${id}-target`}
          >{action === 'rename' ? t('tag.name') : t('tag.mergeInto')}</label
        >
        <input
          id={`${id}-target`}
          bind:value={target}
          maxlength="64"
          required
          disabled={ops.busy}
          list={action === 'merge' ? `${id}-choices` : undefined}
          autocomplete="off"
          data-initial-focus
        />
        {#if action === 'merge'}<datalist id={`${id}-choices`}
            >{#each choices as tag (tag.key)}<option value={tag.display}
              ></option>{/each}</datalist
          >{/if}
      {/if}
      {#if ops.error}<p role="alert">{ops.error}</p>{/if}
      <div class="buttons">
        <button class="primary" disabled={ops.busy}
          >{t('tag.previewChanges')}</button
        >
      </div>
    </form>
  {:else}
    {@const preview = ops.preview}
    <p>
      {t(ACTIONS[preview.operation.action])} #{preview.operation.source}{preview
        .operation.target
        ? ` → #${preview.operation.target}`
        : ''}
    </p>
    <p>
      {t('tag.counts', {
        published: preview.counts.published,
        trash: preview.counts.trash,
      })}
    </p>
    {#if preview.operation.action === 'merge'}<p>
        {t('tag.mergeNote')}
      </p>{/if}
    {#if preview.targetRetired}<p role="alert">
        {t('tag.retired')}
      </p>{/if}
    <p class="help">
      {t('tag.previewHelp')}
    </p>
    {#each preview.samples as sample (sample.id)}<details>
        <summary
          >{t('tag.sample', {
            status: sample.status,
            revision: sample.revision,
          })}
          <a href={`/notes/${sample.id}`}>{t('tag.inspect')}</a></summary
        >
        <pre>{sample.before}</pre>
        <pre>{sample.after}</pre>
      </details>{/each}
    {#if ops.error}<p role="alert">{ops.error}</p>{/if}
    <div class="buttons">
      <button disabled={ops.busy} onclick={() => ops.reset()}
        >{t('tag.back')}</button
      >
      <button
        class:danger={preview.operation.action === 'remove'}
        class:primary={preview.operation.action !== 'remove'}
        disabled={ops.busy || ops.pending.length > 0}
        onclick={() =>
          execute({
            mutationId: crypto.randomUUID(),
            operation: preview.operation,
            previewToken: preview.previewToken,
            confirmed: true,
          })}
        >{t('tag.confirmAction', {
          action: t(ACTIONS[preview.operation.action]),
        })}</button
      >
    </div>
  {/if}
</Modal>

<style>
  .tag-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-2);
  }
  .summary {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: var(--space-1) 0 0;
    color: var(--muted);
    font-size: 0.875rem;
  }
  .leave {
    flex: none;
    font-size: 0.875rem;
    color: var(--muted);
  }
  form {
    display: grid;
    gap: var(--space-2);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: var(--space-2);
    border: 1px solid var(--border);
  }
</style>
