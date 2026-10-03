<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Sidebar, { type ShellTag } from './Sidebar.svelte';
  import Modal from './Modal.svelte';
  import Composer from './Composer.svelte';
  let {
    active = '/',
    tags = [],
    children,
  }: { active?: string; tags?: ShellTag[]; children: Snippet } = $props();
  let drawerOpen = $state(false);
  onMount(() => {
    const desktop = window.matchMedia('(min-width: 900px)');
    const resized = () => {
      if (desktop.matches) drawerOpen = false;
    };
    desktop.addEventListener('change', resized);
    return () => desktop.removeEventListener('change', resized);
  });
</script>

<a class="skip-link" href="#notes-pane">Skip to notes</a>
<div class="app-shell">
  <aside class="desktop-sidebar" aria-label="Sidebar">
    <Sidebar {active} {tags} />
  </aside>
  <div class="main-column">
    <header class="mobile-header">
      <button
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onclick={() => {
          drawerOpen = true;
        }}>Menu & search</button
      >
      <a href="/" aria-label="PandaNote home">PandaNote</a>
    </header>
    <div class="fixed-region">
      <div class="column-inner"><Composer /></div>
      <section class="filter-region column-inner" aria-label="Active filters">
        <span class="muted">All notes · no active filters</span><span
          class="help">Filters come in S09</span
        >
      </section>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The primary scroll surface must be keyboard-scrollable.) -->
    <main
      id="notes-pane"
      class="notes-scroller"
      tabindex="0"
      aria-label="Notes pane"
    >
      <div class="column-inner timeline-content">{@render children()}</div>
    </main>
  </div>
</div>
<Modal bind:open={drawerOpen} title="Notebook navigation" kind="drawer">
  <Sidebar
    {active}
    {tags}
    onNavigate={() => {
      drawerOpen = false;
    }}
  />
</Modal>

<style>
  .app-shell {
    height: 100dvh;
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    overflow: hidden;
  }
  .desktop-sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    min-height: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .main-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .fixed-region {
    flex: none;
    padding: var(--outer-gap) var(--outer-gap) 0;
  }
  .column-inner {
    width: 100%;
    max-width: var(--column-width);
    margin-inline: auto;
  }
  .filter-region {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: 0.875rem;
    padding: var(--space-3) 0;
  }
  .notes-scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: var(--space-1) var(--outer-gap)
      max(var(--outer-gap), env(safe-area-inset-bottom));
  }
  .timeline-content {
    display: grid;
    gap: var(--card-gap);
  }
  .mobile-header {
    display: none;
  }
  @media (max-width: 899px) {
    .app-shell {
      grid-template-columns: minmax(0, 1fr);
      padding: env(safe-area-inset-top) env(safe-area-inset-right) 0
        env(safe-area-inset-left);
    }
    .desktop-sidebar {
      display: none;
    }
    .mobile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--outer-gap);
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .mobile-header a {
      text-decoration: none;
      color: var(--text);
      font-weight: 650;
      min-height: var(--target);
      display: flex;
      align-items: center;
    }
    .fixed-region {
      padding-top: var(--space-3);
    }
  }
  @media (max-height: 340px) {
    .fixed-region {
      max-height: 55dvh;
      overflow: auto;
    }
  }
</style>
