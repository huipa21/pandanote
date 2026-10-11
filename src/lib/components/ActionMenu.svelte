<script module lang="ts">
  export interface ActionMenuItem {
    id: string;
    label: string;
    icon: import('./Icon.svelte').IconName;
    danger?: boolean;
    disabled?: boolean;
    onSelect: () => void;
  }
  // Only one menu is open at a time, across every ActionMenu on the page.
  let openMenu: { close: (restoreFocus: boolean) => void } | null = null;
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    label,
    items,
    disabled = false,
    trigger = $bindable(),
    testid,
  }: {
    /** Accessible name of the `•••` trigger. */
    label: string;
    items: ActionMenuItem[];
    disabled?: boolean;
    /** The trigger button, so callers can return focus after an action. */
    trigger?: HTMLButtonElement;
    testid?: string;
  } = $props();

  const menuId = $props.id();
  let open = $state(false);
  let ready = $state(false);
  let menu = $state<HTMLDivElement>();
  let position = $state({ top: 0, left: 0, ready: false });
  const self = {
    close: (restoreFocus: boolean) => close(restoreFocus),
  };
  const GAP = 4;
  const MARGIN = 8;

  onMount(() => {
    ready = true;
    return () => {
      if (openMenu === self) openMenu = null;
    };
  });

  function place() {
    if (!trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const below = window.innerHeight - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    // Flip upward only when it does not fit below and there is more room above.
    const top =
      height > below && above > below
        ? Math.max(MARGIN, anchor.top - GAP - height)
        : anchor.bottom + GAP;
    // Right-aligned to the trigger, kept inside the viewport horizontally.
    const left = Math.min(
      Math.max(MARGIN, anchor.right - width),
      Math.max(MARGIN, window.innerWidth - width - MARGIN),
    );
    position = { top, left, ready: true };
  }

  async function show() {
    if (openMenu && openMenu !== self) openMenu.close(false);
    openMenu = self;
    position = { ...position, ready: false };
    open = true;
    await tick();
    place();
    // Visibility flips once positioned; hidden items cannot take focus.
    await tick();
    focusItem(0);
  }
  function close(restoreFocus: boolean) {
    if (!open) return;
    open = false;
    if (openMenu === self) openMenu = null;
    if (restoreFocus) void tick().then(() => trigger?.focus());
  }
  function enabledItems(): HTMLButtonElement[] {
    return menu
      ? [
          ...menu.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ),
        ]
      : [];
  }
  function focusItem(index: number) {
    const list = enabledItems();
    if (!list.length) return;
    list[((index % list.length) + list.length) % list.length].focus();
  }
  function keydown(event: KeyboardEvent) {
    const list = enabledItems();
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current < 0 ? -1 : current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === 'Escape') {
      // Escape closes only the menu, never an enclosing dialog.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close(false);
  }
  function triggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) void show();
    }
  }
  function choose(item: ActionMenuItem) {
    if (item.disabled) return;
    close(false);
    item.onSelect();
  }

  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu?.contains(target) && !trigger?.contains(target)) close(false);
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu?.contains(event.target))
        close(false);
    };
    const resize = () => close(false);
    // Scroll does not bubble: capture catches the notes pane and any ancestor.
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<button
  bind:this={trigger}
  type="button"
  class="icon-button"
  aria-label={label}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? menuId : undefined}
  data-testid={testid}
  disabled={!ready || disabled}
  onclick={() => (open ? close(false) : void show())}
  onkeydown={triggerKeydown}><Icon name="dots" /></button
>
{#if open}
  <!-- svelte-ignore a11y_interactive_supports_focus (focus is moved to the items) -->
  <div
    bind:this={menu}
    id={menuId}
    class="menu"
    role="menu"
    aria-label={label}
    style:top={`${position.top}px`}
    style:left={`${position.left}px`}
    style:visibility={position.ready ? 'visible' : 'hidden'}
    onkeydown={keydown}
  >
    {#each items as item (item.id)}
      <button
        type="button"
        role="menuitem"
        class:danger={item.danger}
        disabled={item.disabled}
        onclick={() => choose(item)}
        ><Icon name={item.icon} /><span>{item.label}</span></button
      >
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 20;
    display: grid;
    min-width: 9rem;
    max-width: calc(100vw - 1rem);
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgb(0 0 0 / 14%);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--target);
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    text-align: left;
    color: var(--text);
  }
  .menu button:hover:not(:disabled),
  .menu button:focus-visible {
    background: var(--accent-soft);
  }
  .menu button:disabled {
    color: var(--muted);
  }
  /* Destructive items use the danger colour for text and icon, no border. */
  .menu button.danger {
    color: var(--danger);
    border: 0;
  }
  .menu button.danger:hover:not(:disabled),
  .menu button.danger:focus-visible {
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }
  .menu button:focus-visible {
    outline-offset: -2px;
  }
</style>
