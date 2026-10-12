<script lang="ts">
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import Calendar from './Calendar.svelte';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  import SearchControl from './SearchControl.svelte';
  import { buildInfo } from '#lib/shared/version.ts';
  import TagTree from './TagTree.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { TimelineFilters } from '#lib/shared/timeline.ts';
  import { tagAncestors, type TagNode } from '#lib/shared/tag-tree.ts';
  let {
    calendar,
    active = '/',
    tags = [],
    filters = {},
    searchQuery = '',
    onSearch = async () => {},
    onNavigate = () => {},
  }: {
    calendar?: CalendarState;
    active?: string;
    /** Count-ordered nested tag tree (docs/nested-tags/SPEC.md §3). */
    tags?: TagNode[];
    filters?: TimelineFilters;
    searchQuery?: string;
    onSearch?: (href: string) => Promise<unknown>;
    onNavigate?: () => void;
  } = $props();
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;
  /** Top-level tags shown here; the Tags page lists everything. */
  const VISIBLE_TAGS = 12;
  // In-memory per page session; never persisted.
  const expanded = new SvelteSet<string>();
  $effect(() => {
    // Reveal the branches holding active filters (the user may collapse them).
    if (filters.tag !== undefined)
      for (const ancestor of tagAncestors(filters.tag)) expanded.add(ancestor);
  });
</script>

<div class="sidebar-content">
  <div class="sidebar-top">
    <a class="identity" href="/" onclick={onNavigate}
      ><span class="site-title" title={i18n.siteTitle}>{i18n.siteTitle}</span>
      <span class="muted">{t('brand.tagline')}</span></a
    >
    <SearchControl
      {filters}
      {active}
      query={searchQuery}
      {onSearch}
      {onNavigate}
    />
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the independently scrollable sidebar section.) -->
  <div
    class="sidebar-sections"
    tabindex="0"
    role="region"
    aria-label={t('shell.calendarAndTags')}
  >
    <section aria-label={t('shell.monthActivity')}>
      {#if calendar}<Calendar {calendar} {filters} {onNavigate} />{:else}<p
          class="help"
        >
          {t('shell.calendarUnavailable')}
        </p>{/if}
    </section>
    <section aria-labelledby={`${id}-tags`}>
      <h2 id={`${id}-tags`}>
        <a href="/tags" onclick={onNavigate}>{t('shell.tags')}</a>
      </h2>
      {#if tags.length}
        <div class="tag-list">
          <TagTree
            nodes={tags.slice(0, VISIBLE_TAGS)}
            {filters}
            {expanded}
            {onNavigate}
          />
          {#if tags.length > VISIBLE_TAGS}<a
              class="more"
              href="/tags"
              aria-label={t('shell.allTags', { count: tags.length })}
              onclick={onNavigate}>+{tags.length - VISIBLE_TAGS}</a
            >{/if}
        </div>
      {:else}<p class="help">{t('shell.noTags')}</p>{/if}
    </section>
  </div>
  <nav class="sidebar-bottom" aria-label={t('shell.utilities')}>
    <a
      href="/trash"
      aria-current={active === '/trash' ? 'page' : undefined}
      onclick={onNavigate}>{t('shell.trash')}</a
    >
    <a
      href="/settings"
      aria-current={active === '/settings' ? 'page' : undefined}
      onclick={onNavigate}>{t('shell.settings')}</a
    >
    <p class="version muted" data-app-version>
      {t('shell.version', { version: buildInfo.version })}
    </p>
  </nav>
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    height: 100%;
  }
  .sidebar-top {
    padding: var(--space-4);
    padding-bottom: var(--space-2);
  }
  .identity {
    display: block;
    font-size: 1.25rem;
    font-weight: 650;
    color: var(--text);
    text-decoration: none;
    margin-bottom: var(--space-4);
  }
  .identity .site-title {
    display: block;
  }
  .identity .muted {
    display: block;
    font-size: 0.75rem;
    font-weight: 400;
  }
  nav {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }
  nav a {
    display: flex;
    align-items: center;
    min-height: var(--row-target);
    padding: var(--space-1) var(--space-3);
    text-decoration: none;
    border-radius: var(--radius);
    color: var(--text);
  }
  nav a:hover,
  nav a[aria-current='page'] {
    color: var(--accent);
    background: var(--accent-soft);
  }
  nav a[aria-current='page'] {
    font-weight: 650;
  }
  .sidebar-sections {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-2) var(--space-4);
  }
  section + section {
    margin-top: var(--space-4);
  }
  h2 {
    margin: var(--space-2) 0;
    font-size: 0.9375rem;
  }
  h2 a {
    display: inline-flex;
    align-items: center;
    min-height: var(--row-target);
    color: var(--text);
    text-decoration: none;
  }
  h2 a:hover {
    color: var(--accent);
  }
  .more {
    display: inline-flex;
    align-items: center;
    min-height: var(--row-target);
    margin-top: var(--space-1);
    color: var(--muted);
    text-decoration: none;
  }
  .more:hover {
    color: var(--accent);
  }
  .sidebar-bottom {
    margin: auto 0 0;
    padding: var(--space-3) var(--space-4);
    flex: none;
  }
  .version {
    margin: 0;
    padding-inline: var(--space-3);
    font-size: 0.75rem;
  }
  .tag-list {
    margin-block: var(--space-2);
  }
  @media (max-height: 540px) {
    .sidebar-top {
      padding-block: var(--space-2);
    }
    .identity {
      margin-bottom: var(--space-2);
    }
    .identity .muted {
      display: none;
    }
    .sidebar-bottom {
      padding-block: var(--space-1);
    }
  }
  @media (max-height: 340px) {
    .sidebar-content {
      overflow: auto;
    }
    .sidebar-sections {
      overflow: visible;
      flex: none;
    }
  }
</style>
