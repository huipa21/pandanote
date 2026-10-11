<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    canonicalFilters,
    filterHref,
    type TimelineFilters,
  } from '#lib/shared/timeline.ts';
  import { parseSearch } from '#lib/shared/search.ts';
  import SearchBox from './SearchBox.svelte';
  let {
    filters,
    active = '/',
    query = '',
    onSearch = async () => {},
    onNavigate = () => {},
  }: {
    filters: TimelineFilters;
    active?: string;
    query?: string;
    onSearch?: (href: string) => Promise<unknown>;
    onNavigate?: () => void;
  } = $props();
  const id = $props.id();
  const t = useI18n().t;
  let value = $state(untrack(() => query));
  let message = $state('');
  let ready = $state(false);
  let pending = false;
  let timer: ReturnType<typeof setTimeout>;
  let generation = 0;
  let composing = false;
  let flight = 0;
  function supersede() {
    if (flight) {
      flight = 0;
      // A navigation to the last committed filters invalidates an older Kit
      // navigation immediately, even if the new input is malformed/composing.
      void onSearch(filterHref(filters)).catch(() => {});
    }
  }
  $effect(() => {
    const route = active;
    untrack(() => {
      if (route !== '/') {
        generation++;
        clearTimeout(timer);
        pending = false;
        message = '';
      }
    });
  });
  $effect(() => {
    const current = query;
    untrack(() => {
      if (!pending) {
        value = current;
        message = '';
      }
    });
  });
  onMount(() => {
    ready = true;
    return () => {
      generation++;
      clearTimeout(timer);
    };
  });
  function changed() {
    if (composing) return;
    clearTimeout(timer);
    const current = ++generation;
    supersede();
    pending = true;
    message = '';
    try {
      parseSearch(value);
    } catch (error) {
      message =
        error instanceof Error ? error.message : 'Check the search query.';
      pending = false;
      return;
    }
    timer = setTimeout(() => {
      const href = filterHref(
        canonicalFilters(filters.tag, value, filters.day, filters.date),
      );
      // Kit discards superseded navigation responses; timeline paging separately
      // aborts on beforeNavigate. Never adopt an old response's input while typing.
      flight = current;
      void onSearch(href)
        .then(() => {
          if (generation !== current) return;
          flight = 0;
          pending = false;
          onNavigate();
        })
        .catch(() => {
          if (generation === current) {
            flight = 0;
            pending = false;
            message = t('search.failed');
          }
        });
    }, 300);
  }
</script>

<SearchBox
  {id}
  label={t('search.label')}
  disabled={!ready}
  bind:value
  oninput={changed}
  oncompositionstart={() => {
    composing = true;
    clearTimeout(timer);
    generation++;
    supersede();
  }}
  oncompositionend={() => {
    composing = false;
    changed();
  }}
  aria-invalid={!!message}
  aria-describedby={`${id}-message`}
/>
<p id={`${id}-message`} class="search-error" role="status" aria-live="polite">
  {message}
</p>

<style>
  .search-error {
    margin: var(--space-1) 0 0;
    font-size: 0.75rem;
    color: var(--danger);
  }
  .search-error:empty {
    display: none;
  }
</style>
