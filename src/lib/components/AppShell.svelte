<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  import Sidebar from './Sidebar.svelte';
  import type { TagNode } from '#lib/shared/tag-tree.ts';
  import Modal from './Modal.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import Composer from './Composer.svelte';
  import {
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    clampSidebarWidth,
    sidebarMaximum,
  } from '#lib/client/sidebar-size.ts';
  import { filterHref, type TimelineFilters } from '#lib/shared/timeline.ts';
  let {
    calendar,
    active = '/',
    tags = [],
    filters = {},
    searchQuery = '',
    onSearch = async () => {},
    children,
  }: {
    calendar?: CalendarState;
    active?: string;
    tags?: TagNode[];
    filters?: TimelineFilters;
    searchQuery?: string;
    onSearch?: (href: string) => Promise<unknown>;
    children: Snippet;
  } = $props();
  // The composer belongs only to the unfiltered main timeline.
  const hasFilters = $derived(
    Boolean(filters.tag !== undefined || filters.query || filters.day),
  );
  // A tag view is announced by its own header (with a way back to all notes),
  // so the chip strip appears only for the search and day filters.
  const showStrip = $derived(Boolean(filters.query || filters.day));
  const i18n = useI18n();
  const t = i18n.t;
  let drawerOpen = $state(false);
  let ready = $state(false);
  let scroller: HTMLElement;
  let sidebarWidth = $state(DEFAULT_SIDEBAR_WIDTH);
  let maximumWidth = $state(sidebarMaximum(1440));
  let dragging = $state(false);
  let drag: { id: number; x: number; width: number } | undefined;
  function startResize(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, width: sidebarWidth };
    dragging = true;
  }
  function resize(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    sidebarWidth = clampSidebarWidth(
      drag.width + event.clientX - drag.x,
      window.innerWidth,
    );
  }
  function stopResize() {
    drag = undefined;
    dragging = false;
  }
  function resizeKey(event: KeyboardEvent) {
    const widths: Record<string, number> = {
      ArrowLeft: sidebarWidth - 20,
      ArrowRight: sidebarWidth + 20,
      Home: MIN_SIDEBAR_WIDTH,
      End: maximumWidth,
    };
    if (!(event.key in widths)) return;
    event.preventDefault();
    sidebarWidth = clampSidebarWidth(widths[event.key], window.innerWidth);
  }
  onMount(() => {
    ready = true;
    const desktop = window.matchMedia('(min-width: 900px)');
    const resized = () => {
      if (desktop.matches) {
        maximumWidth = sidebarMaximum(window.innerWidth);
        sidebarWidth = clampSidebarWidth(sidebarWidth, window.innerWidth);
        drawerOpen = false;
      } else stopResize();
    };
    resized();
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  });
</script>

<a class="skip-link" href="#notes-pane">{t('shell.skip')}</a>
<div
  class="app-shell"
  class:resizing={dragging}
  style:--sidebar-width={`${sidebarWidth}px`}
>
  <aside
    id="desktop-sidebar"
    class="desktop-sidebar"
    aria-label={t('shell.sidebar')}
  >
    <Sidebar {calendar} {active} {tags} {filters} {searchQuery} {onSearch} />
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (A focusable ARIA window splitter supports pointer and keyboard resizing.) -->
    <div
      class="sidebar-resizer"
      role="separator"
      tabindex="0"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls="desktop-sidebar"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={maximumWidth}
      aria-valuenow={sidebarWidth}
      aria-valuetext={`${sidebarWidth} pixels`}
      title="Drag to resize sidebar; use arrow keys when focused"
      onpointerdown={startResize}
      onpointermove={resize}
      onpointerup={stopResize}
      onpointercancel={stopResize}
      onlostpointercapture={stopResize}
      onkeydown={resizeKey}
    ></div>
  </aside>
  <div class="main-column">
    <header class="mobile-header">
      <button
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onclick={() => {
          drawerOpen = true;
        }}>{t('shell.menu')}</button
      >
      <a
        href="/"
        class="brand"
        aria-label={t('brand.home', { title: i18n.siteTitle })}
        ><span class="site-title" title={i18n.siteTitle}>{i18n.siteTitle}</span
        ></a
      >
    </header>
    {#snippet composerRegion()}
      <div class="composer-region">
        {#if !hasFilters}<div class="column-inner"><Composer /></div>{/if}
        {#if showStrip}<section
            class="filter-region column-inner"
            aria-label={t('shell.activeFilters')}
          >
            {#if hasFilters}
              <div class="filter-chips">
                {#if filters.query}<a
                    class="filter-chip"
                    href={filterHref({ ...filters, query: '' })}
                    aria-label="Remove search filter"
                    >Search: {filters.query} ×</a
                  >{/if}
                {#if filters.day}<a
                    class="filter-chip"
                    href={filterHref({
                      ...filters,
                      day: undefined,
                      date: undefined,
                    })}
                    aria-label="Remove day filter"
                    >{filters.date ?? 'Selected day'} ×</a
                  >{/if}
              </div>
              <a href="/">{t('shell.clearAll')}</a>
            {/if}
          </section>{/if}
      </div>
    {/snippet}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The primary scroll surface must be keyboard-scrollable.) -->
    <main
      id="notes-pane"
      class="notes-scroller"
      tabindex="0"
      aria-label="Notes pane"
      bind:this={scroller}
    >
      {#if active === '/'}{@render composerRegion()}{/if}
      <div class="column-inner timeline-content">{@render children()}</div>
      {#if active === '/'}
        <footer class="back-to-top column-inner">
          <button
            disabled={!ready}
            onclick={() => {
              scroller.focus({ preventScroll: true });
              scroller.scrollTo({ top: 0, behavior: 'instant' });
            }}>Back to Top ↑</button
          >
        </footer>
      {/if}
    </main>
  </div>
</div>
<Modal bind:open={drawerOpen} title={t('shell.drawer')} kind="drawer">
  <Sidebar
    {calendar}
    {active}
    {tags}
    {filters}
    {searchQuery}
    {onSearch}
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
    position: relative;
    min-width: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    min-height: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .sidebar-resizer {
    position: absolute;
    z-index: 1;
    inset-block: 0;
    right: -5px;
    width: 10px;
    cursor: col-resize;
    touch-action: none;
  }
  .sidebar-resizer:hover,
  .sidebar-resizer:focus-visible,
  .resizing .sidebar-resizer {
    background: var(--accent-soft);
    border-inline: 1px solid var(--accent);
  }
  .sidebar-resizer:focus-visible {
    outline-offset: -3px;
  }
  .resizing {
    cursor: col-resize;
    user-select: none;
  }
  .main-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .composer-region {
    flex: none;
    padding: var(--outer-gap) var(--outer-gap) 0;
  }
  .notes-scroller > .composer-region {
    padding: calc(var(--outer-gap) - var(--space-1)) 0 0;
  }
  .back-to-top {
    padding-block: var(--space-5);
    text-align: center;
    overflow-anchor: none;
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
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filter-chip {
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius);
    padding: var(--space-2);
    text-decoration: none;
    overflow-wrap: anywhere;
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
    .mobile-header .brand {
      min-width: 0;
      text-decoration: none;
      color: var(--text);
      font-weight: 650;
      min-height: var(--target);
      display: flex;
      align-items: center;
    }
    .composer-region,
    .notes-scroller > .composer-region {
      padding-top: var(--space-3);
    }
  }
  @media (max-height: 340px) {
    .main-column > .composer-region {
      max-height: 55dvh;
      overflow: auto;
    }
  }
</style>
