<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  let {
    open = $bindable(false),
    title,
    kind = 'panel',
    children,
  }: {
    open?: boolean;
    title: string;
    kind?: 'panel' | 'drawer' | 'editor';
    children: Snippet;
  } = $props();
  const titleId = $props.id();
  let dialog: HTMLDialogElement;
  let opener: HTMLElement | null = null;
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    return () => {
      dialog?.close();
    };
  });
  $effect(() => {
    if (!mounted) return;
    if (open && !dialog.open) {
      opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    } else if (!open && dialog.open) dialog.close();
  });
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // A nonempty search input otherwise consumes Escape before native cancel.
      event.preventDefault();
      event.stopPropagation();
      open = false;
    } else if (event.key === 'Tab') {
      event.stopPropagation(); // A nested modal owns its focus, not its parent.
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) => el.getClientRects().length && el.closest('dialog') === dialog,
      );
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  function closed() {
    open = false;
    if (opener?.isConnected) opener.focus();
  }
</script>

<dialog
  bind:this={dialog}
  class={kind}
  aria-labelledby={titleId}
  onclose={closed}
  onkeydown={keydown}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button
      type="button"
      aria-label={`Close ${title}`}
      onclick={() => {
        open = false;
      }}>Close</button
    >
  </header>
  <div class="dialog-body">{@render children()}</div>
</dialog>

<style>
  dialog {
    padding: 0;
    width: min(36rem, calc(100% - 2 * var(--outer-gap)));
    max-width: none;
    max-height: calc(100dvh - 2 * var(--outer-gap));
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: var(--overlay);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    flex: none;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
  }
  .dialog-body {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--space-4);
  }
  .drawer {
    margin: 0;
    width: min(22rem, 100%);
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .drawer .dialog-body {
    padding: 0;
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .editor {
    width: min(52rem, calc(100% - 2 * var(--outer-gap)));
  }
  .editor .dialog-body {
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 899px) and (max-height: 400px) {
    .editor header {
      padding-block: var(--space-1);
    }
    .editor .dialog-body {
      padding-block: var(--space-1);
    }
  }
  @media (max-width: 899px) {
    .editor {
      margin: 0;
      width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      border: 0;
      border-radius: 0;
      padding: env(safe-area-inset-top) env(safe-area-inset-right)
        env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    .editor .dialog-body {
      flex: 1;
      overflow: hidden;
    }
  }
</style>
