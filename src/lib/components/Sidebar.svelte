<script lang="ts">
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import Calendar from './Calendar.svelte';
  import TitleControls from './TitleControls.svelte';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  import SearchControl from './SearchControl.svelte';
  import TagList from './TagList.svelte';
  import LabelList from './LabelList.svelte';
  import type { TimelineFilters, TimelineTag } from '#lib/shared/timeline.ts';
  import type { LabelSummary } from '#lib/shared/labels.ts';
  let {
    calendar,
    active = '/',
    tags = [],
    labels = [],
    filters = {},
    searchQuery = '',
    onSearch = async () => {},
    onNavigate = () => {},
  }: {
    calendar?: CalendarState;
    active?: string;
    /** Tags of published notes, most used first. */
    tags?: TimelineTag[];
    /** Labels of published notes, most used first. */
    labels?: LabelSummary[];
    filters?: TimelineFilters;
    searchQuery?: string;
    onSearch?: (href: string) => Promise<unknown>;
    onNavigate?: () => void;
  } = $props();
  const id = $props.id();
  const i18n = useI18n();
  const t = i18n.t;
  /** Tags/labels shown here; the Tags/Labels pages list everything. */
  const VISIBLE_TAGS = 12;
  const VISIBLE_LABELS = 12;
  const sortedLabels = $derived(
    [...labels].sort(
      (a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name),
    ),
  );
</script>

<div class="sidebar-content">
  <div class="sidebar-top">
    <div class="identity-row">
      <a class="identity" href="/" onclick={onNavigate}
        ><span class="site-title" title={i18n.siteTitle}>{i18n.siteTitle}</span
        ></a
      >
      <TitleControls />
    </div>
    <p class="tagline muted">{i18n.tagline || t('brand.tagline')}</p>
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
          <TagList tags={tags.slice(0, VISIBLE_TAGS)} {filters} {onNavigate} />
          {#if tags.length > VISIBLE_TAGS}<a
              class="more"
              href="/tags"
              aria-label={t('shell.allTags', { count: tags.length })}
              onclick={onNavigate}>+{tags.length - VISIBLE_TAGS}</a
            >{/if}
        </div>
      {:else}<p class="help">{t('shell.noTags')}</p>{/if}
    </section>
    <section aria-labelledby={`${id}-labels`}>
      <h2 id={`${id}-labels`}>
        <a href="/labels" onclick={onNavigate}>{t('shell.labels')}</a>
      </h2>
      {#if sortedLabels.length}
        <div class="tag-list">
          <LabelList
            labels={sortedLabels.slice(0, VISIBLE_LABELS)}
            {filters}
            {onNavigate}
          />
          {#if sortedLabels.length > VISIBLE_LABELS}<a
              class="more"
              href="/labels"
              aria-label={t('shell.allLabels', { count: sortedLabels.length })}
              onclick={onNavigate}>+{sortedLabels.length - VISIBLE_LABELS}</a
            >{/if}
        </div>
      {:else}<p class="help">{t('shell.noLabels')}</p>{/if}
    </section>
  </div>
  <nav class="sidebar-bottom" aria-label={t('shell.utilities')}>
    <a
      href="/templates"
      aria-current={active === '/templates' ? 'page' : undefined}
      onclick={onNavigate}>{t('shell.templates')}</a
    >
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
    <p class="attribution muted">
      Powered by
      <a
        class="attribution-link"
        href="https://github.com/huipa21/pandanote"
        target="_blank"
        rel="noopener noreferrer">Pandanote</a
      >
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
  .identity-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .identity {
    flex: 1;
    min-width: 0;
    display: block;
    font-size: 1.25rem;
    font-weight: 650;
    color: var(--text);
    text-decoration: none;
  }
  .identity .site-title {
    display: block;
  }
  .tagline {
    margin: 0 0 var(--space-4);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
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
    padding: var(--space-1) 0;
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
  .attribution {
    margin: var(--space-1) 0 0;
    font-size: 0.75rem;
  }
  .sidebar-bottom a.attribution-link {
    display: inline;
    min-height: 0;
    padding: 0;
    color: inherit;
    text-decoration: underline;
  }
  .sidebar-bottom a.attribution-link:hover {
    color: var(--accent);
    background: none;
  }
  .tag-list {
    margin-block: var(--space-2);
  }
  @media (max-height: 540px) {
    .sidebar-top {
      padding-block: var(--space-2);
    }
    .tagline {
      display: none;
    }
    .identity-row {
      margin-bottom: var(--space-2);
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
