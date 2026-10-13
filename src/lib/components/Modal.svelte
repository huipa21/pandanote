<script lang="ts">
  import { onMount, untrack, tick, type Snippet } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  let {
    open = $bindable(false),
    title,
    kind = 'panel',
    dismissible = true,
    onDismiss = () => {},
    ssrOpen = false,
    onKey = () => {},
    customHeader = false,
    children,
  }: {
    open?: boolean;
    title: string;
    kind?: 'panel' | 'drawer' | 'editor' | 'detail' | 'viewer';
    dismissible?: boolean;
    onDismiss?: () => void;
    ssrOpen?: boolean;
    onKey?: (event: KeyboardEvent) => void;
    customHeader?: boolean;
    children: Snippet;
  } = $props();
  const titleId = $props.id();
  const t = useI18n().t;
  // Initial SSR readability only. After mount preserve the native DOM state,
  // not a desired-open attribute: Svelte groups attributes into one render effect
  // and unrelated button rerenders must not cancel showModal's top-layer state.
  const initialOpen = untrack(() => ssrOpen);
  let dialog = $state<HTMLDialogElement>(null!);
  let opener: HTMLElement | null = null;
  let mounted = $state(false);
  onMount(() => {
    // Direct detail content is readable without JS; upgrade its nonmodal SSR
    // dialog to native modal inertness after hydration.
    if (dialog.open) dialog.close();
    mounted = true;
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
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
      void tick().then(() => {
        const focusedDialog = document.activeElement?.closest('dialog');
        if (
          !dialog?.isConnected ||
          !dialog.open ||
          (focusedDialog && focusedDialog !== dialog)
        )
          return;
        const initial =
          dialog.querySelector<HTMLElement>(
            '[data-initial-focus]:not(:disabled)',
          ) ??
          dialog.querySelector<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)',
          );
        initial?.focus();
      });
    } else if (!open && dialog.open) dialog.close();
  });
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // A nonempty search input otherwise consumes Escape before native cancel.
      event.preventDefault();
      event.stopPropagation();
      dismiss();
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
      if (!targets.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    } else onKey(event);
  }
  function dismiss() {
    if (!dismissible) return;
    open = false;
    onDismiss();
  }
  function closed() {
    // The SSR-to-modal upgrade queues close; ignore it once reopened.
    if (dialog.open) return;
    open = false;
    if (opener?.isConnected) opener.focus();
  }
</script>

<dialog
  bind:this={dialog}
  open={mounted ? dialog?.open : initialOpen || undefined}
  class={kind}
  aria-labelledby={titleId}
  onclose={closed}
  oncancel={(event) => {
    event.preventDefault();
    dismiss();
  }}
  onkeydown={keydown}
>
  {#if customHeader}<h2 class="sr-only" id={titleId}>{title}</h2>{:else}<header>
      <h2 id={titleId}>{title}</h2>
      <button
        type="button"
        aria-label={t('modal.closeNamed', { title })}
        disabled={!mounted || !dismissible}
        onclick={dismiss}>{t('modal.close')}</button
      >
    </header>{/if}
  <div class="dialog-body" class:custom-header={customHeader}>
    {@render children()}
  </div>
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
  .drawer > .dialog-body {
    padding: 0;
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .detail {
    position: fixed;
    inset: 0;
    width: min(52rem, calc(100% - 2 * var(--outer-gap)));
    height: min(52rem, calc(100dvh - 2 * var(--outer-gap)));
  }
  .detail .dialog-body {
    flex: 1;
  }
  .viewer {
    position: fixed;
    inset: 0;
    margin: 0;
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .viewer .dialog-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .editor {
    width: min(52rem, calc(100% - 2 * var(--outer-gap)));
    height: min(48rem, calc(100dvh - 2 * var(--outer-gap)));
  }
  .editor .dialog-body {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .editor .custom-header {
    padding: 0;
    overflow: hidden;
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
    .editor,
    .detail {
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
