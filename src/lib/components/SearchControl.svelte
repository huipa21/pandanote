<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    canonicalFilters,
    filterHref,
    type TimelineFilters,
  } from '#lib/shared/timeline.ts';
  import { parseSearch } from '#lib/shared/search.ts';
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
        canonicalFilters(filters.tags, value, filters.day, filters.date),
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
            message = 'Search could not load. Edit the query to retry.';
          }
        });
    }, 300);
  }
</script>

<label class="search-label" for={id}>Search notes</label>
<input
  {id}
  type="search"
  placeholder="Words or &quot;exact phrase&quot;"
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
  aria-describedby={`${id}-help`}
/>
<p
  id={`${id}-help`}
  class:search-error={!!message}
  class="help"
  aria-live="polite"
>
  {message || 'All terms · published notes · all months'}
</p>

<style>
  input {
    width: 100%;
  }
  .search-label {
    font-size: 0.875rem;
  }
  .help {
    font-size: 0.75rem;
    margin: var(--space-1) 0;
  }
  .search-error {
    color: var(--danger);
  }
</style>
