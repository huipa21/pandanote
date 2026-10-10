<script lang="ts">
  import { tick } from 'svelte';
  import type { EditorWorkspace } from '#lib/client/editor/workspace.svelte.ts';
  import { tagKey, tagSpans } from '#lib/shared/markdown/tags.ts';
  let {
    textarea,
    workspace,
  }: { textarea: HTMLTextAreaElement | undefined; workspace: EditorWorkspace } =
    $props();
  const id = $props.id();
  let choices = $state<{ key: string; display: string }[]>([]),
    selected = $state(0);
  let start = 0,
    end = 0;
  function update() {
    choices = [];
    if (!textarea || textarea.disabled || document.activeElement !== textarea)
      return;
    const cursor = textarea.selectionStart;
    if (cursor !== textarea.selectionEnd) return;
    const prefix = textarea.value
      .slice(0, cursor)
      .match(/#([\p{L}\p{N}\p{M}_-]*)$/u);
    if (!prefix) return;
    const position = cursor - prefix[0].length;
    try {
      // Probe an empty marker with a temporary letter through the SAME parser;
      // code/HTML/destinations/escapes can never trigger insertion suggestions.
      const source = prefix[1]
        ? textarea.value
        : textarea.value.slice(0, cursor) + 'x' + textarea.value.slice(cursor);
      const span = tagSpans(source).find(
        (s) => s.start === position && s.end >= cursor,
      );
      if (!span) return;
      start = position;
      end = prefix[1] ? span.end : cursor;
      choices = workspace.knownTags
        .filter(
          (t) => t.key.startsWith(tagKey(prefix[1])) && t.display !== prefix[1],
        )
        .slice(0, 8);
      selected = 0;
    } catch {
      /* Invalid tags are validated when posting; never trap writing. */
    }
  }
  async function choose(index: number) {
    if (!textarea || !choices[index]) return;
    const value = '#' + choices[index].display;
    workspace.change(
      textarea.value.slice(0, start) + value + textarea.value.slice(end),
    );
    choices = [];
    await tick();
    textarea.focus();
    textarea.setSelectionRange(start + value.length, start + value.length);
  }
  $effect(() => {
    const input = textarea;
    if (!input) return;
    function key(event: KeyboardEvent) {
      if (!choices.length || event.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        selected =
          (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
          choices.length;
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void choose(selected);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        choices = [];
      }
    }
    function blur() {
      choices = [];
    }
    function cursor(event: Event) {
      if (
        !(event instanceof KeyboardEvent) ||
        !['Enter', 'ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)
      )
        update();
    }
    input.setAttribute('aria-autocomplete', 'list');
    input.addEventListener('input', update);
    input.addEventListener('click', update);
    input.addEventListener('keyup', cursor);
    input.addEventListener('keydown', key);
    input.addEventListener('blur', blur);
    return () => {
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-activedescendant');
      input.removeEventListener('input', update);
      input.removeEventListener('click', update);
      input.removeEventListener('keyup', cursor);
      input.removeEventListener('keydown', key);
      input.removeEventListener('blur', blur);
    };
  });
  $effect(() => {
    // aria-controls must reference an existing element: only while the listbox is rendered.
    if (choices.length) {
      textarea?.setAttribute('aria-controls', id);
      textarea?.setAttribute('aria-activedescendant', `${id}-${selected}`);
    } else {
      textarea?.removeAttribute('aria-controls');
      textarea?.removeAttribute('aria-activedescendant');
    }
  });
</script>

{#if choices.length}<div
    class="suggestions"
    {id}
    role="listbox"
    aria-label="Existing tags"
  >
    {#each choices as tag, index (tag.key)}<button
        id={`${id}-${index}`}
        role="option"
        aria-selected={selected === index}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => choose(index)}>#{tag.display}</button
      >{/each}
  </div>{/if}

<style>
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    max-height: 6rem;
    overflow: auto;
    flex: none;
  }
  button[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
</style>
