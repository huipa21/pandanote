<script lang="ts">
  import Modal from './Modal.svelte';
  import Calendar from './Calendar.svelte';
  import type { CalendarState } from '#lib/client/timeline/calendar.svelte.ts';
  import SearchControl from './SearchControl.svelte';
  import { buildInfo } from '#lib/shared/version.ts';
  import { toggleTag, type TimelineFilters } from '#lib/shared/timeline.ts';
  export interface ShellTag {
    id: string;
    label: string;
    key?: string;
    count?: number;
  }
  let {
    calendar,
    active = '/',
    tags = [],
    filters = { tags: [] },
    searchQuery = '',
    onSearch = async () => {},
    onNavigate = () => {},
  }: {
    calendar?: CalendarState;
    active?: string;
    tags?: ShellTag[];
    filters?: TimelineFilters;
    searchQuery?: string;
    onSearch?: (href: string) => Promise<unknown>;
    onNavigate?: () => void;
  } = $props();
  const id = $props.id();
  let showTags = $state(false);
  let tagQuery = $state('');
  const nav = [
    { href: '/', label: 'All notes' },
    { href: '/drafts', label: 'Drafts' },
  ];
  const filteredTags = $derived(
    tags.filter((tag) =>
      tag.label.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase()),
    ),
  );
</script>

<div class="sidebar-content">
  <div class="sidebar-top">
    <a class="identity" href="/" onclick={onNavigate}
      >PandaNote <span class="muted">a little room to think</span></a
    >
    <SearchControl
      {filters}
      {active}
      query={searchQuery}
      {onSearch}
      {onNavigate}
    />
    <nav aria-label="Notebook">
      {#each nav as item (item.href)}
        <a
          href={item.href}
          aria-current={active === item.href ? 'page' : undefined}
          onclick={onNavigate}>{item.label}</a
        >
      {/each}
    </nav>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the independently scrollable sidebar section.) -->
  <div
    class="sidebar-sections"
    tabindex="0"
    role="region"
    aria-label="Calendar and tags"
  >
    <section aria-labelledby={`${id}-calendar`}>
      <h2 id={`${id}-calendar`}>Month activity</h2>
      {#if calendar}<Calendar {calendar} {filters} {onNavigate} />{:else}<p
          class="help"
        >
          Calendar is unavailable right now.
        </p>{/if}
    </section>
    <section aria-labelledby={`${id}-tags`}>
      <div class="section-heading">
        <h2 id={`${id}-tags`}>Tags</h2>
        <a href="/tags" onclick={onNavigate}>Manage</a>
      </div>
      {#if tags.length}
        <ul class="tag-list">
          {#each tags.slice(0, 6) as tag (tag.id)}<li>
              <a
                href={toggleTag(filters, tag.key ?? tag.label)}
                aria-current={filters.tags.includes(tag.key ?? tag.label)
                  ? 'true'
                  : undefined}
                onclick={onNavigate}
                >#{tag.label}{#if tag.count !== undefined}
                  <span class="muted">({tag.count})</span>{/if}</a
              >
            </li>{/each}
        </ul>
        {#if tags.length > 6}<button
            onclick={() => {
              showTags = true;
            }}>Show all tags ({tags.length})</button
          >{/if}
      {:else}<p class="help">No published tags yet.</p>{/if}
    </section>
  </div>
  <nav class="sidebar-bottom" aria-label="Utilities">
    <a
      href="/trash"
      aria-current={active === '/trash' ? 'page' : undefined}
      onclick={onNavigate}>Trash</a
    >
    <a
      href="/settings"
      aria-current={active === '/settings' ? 'page' : undefined}
      onclick={onNavigate}>Settings</a
    >
    <p class="version muted" data-app-version>Version {buildInfo.version}</p>
  </nav>
</div>

<Modal bind:open={showTags} title="All tags">
  <label for={`${id}-query`}>Find a tag</label>
  <input
    id={`${id}-query`}
    type="search"
    bind:value={tagQuery}
    data-initial-focus
  />
  <ul class="tag-list">
    {#each filteredTags as tag (tag.id)}<li>
        <a
          href={toggleTag(filters, tag.key ?? tag.label)}
          aria-current={filters.tags.includes(tag.key ?? tag.label)
            ? 'true'
            : undefined}
          onclick={() => {
            showTags = false;
            onNavigate();
          }}
          >#{tag.label}{#if tag.count !== undefined}
            <span class="muted">({tag.count})</span>{/if}</a
        >
      </li>{/each}
  </ul>
  {#if !filteredTags.length}<p class="muted">No matching tags.</p>{/if}
  <p class="help">Select tags to show notes matching all of them.</p>
</Modal>

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
    margin-bottom: var(--space-5);
  }
  .identity span {
    display: block;
    font-size: 0.75rem;
    font-weight: 400;
  }
  input {
    width: 100%;
  }
  nav {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }
  nav a {
    display: flex;
    align-items: center;
    min-height: var(--target);
    padding: var(--space-2) var(--space-3);
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
    border-top: 1px solid var(--border);
    margin-top: var(--space-5);
    padding-top: var(--space-3);
  }
  h2 {
    margin: var(--space-2) 0;
    font-size: 0.9375rem;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .section-heading a {
    min-height: var(--target);
    display: flex;
    align-items: center;
    font-size: 0.875rem;
  }
  .sidebar-bottom {
    margin: auto 0 0;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
    flex: none;
  }
  .version {
    margin: 0;
    padding-inline: var(--space-3);
    font-size: 0.75rem;
  }
  .tag-list {
    list-style: none;
    padding: 0;
    margin-block: var(--space-2);
  }
  .tag-list a {
    display: block;
    color: var(--accent);
    min-height: var(--target);
  }
  .tag-list a[aria-current='true'] {
    font-weight: 650;
    background: var(--accent-soft);
  }
  .tag-list li {
    padding-block: var(--space-2);
    overflow-wrap: anywhere;
  }
  @media (max-height: 540px) {
    .sidebar-top {
      padding-block: var(--space-2);
    }
    .identity {
      margin-bottom: var(--space-2);
    }
    .identity span {
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
