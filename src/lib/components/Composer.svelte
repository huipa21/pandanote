<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import {
    EDITOR_WORKSPACE,
    type EditorWorkspace,
  } from '#lib/client/editor/workspace.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import NoteEditor from './NoteEditor.svelte';

  /** Top-of-timeline composer for NEW notes. Edits render in place elsewhere. */
  const workspace = getContext<EditorWorkspace | undefined>(EDITOR_WORKSPACE);
  let focusOpen = $state(false);
  const t = useI18n().t;
  let localText = $state('');
  let mounted = $state(false);
  let editor = $state<ReturnType<typeof NoteEditor>>();
  // While an edit is open on a card or note page this composer stays collapsed.
  const editing = $derived(workspace?.editOrigin != null);
  const text = $derived(
    workspace
      ? workspace.active?.kind === 'new'
        ? workspace.active.bodyMarkdown
        : ''
      : localText,
  );

  onMount(() => {
    mounted = true;
  });
  async function compose() {
    if (workspace && !(await workspace.startNew())) return;
    focusOpen = true;
  }
</script>

<NoteEditor
  bind:this={editor}
  variant="composer"
  showInline={!editing}
  bind:focusOpen
  bind:localText
/>
<button class="mobile-compose primary" disabled={!mounted} onclick={compose}>
  {text ? t('composer.continue') : t('composer.compose')}
</button>

<style>
  .mobile-compose {
    display: none;
  }
  @media (max-width: 899px) {
    .mobile-compose {
      display: block;
      min-width: var(--target);
    }
  }
</style>
