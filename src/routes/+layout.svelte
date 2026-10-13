<script lang="ts">
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  import { setContext, untrack } from 'svelte';
  import { afterNavigate, invalidateAll } from '$app/navigation';
  import { I18N, I18n } from '#lib/client/i18n.svelte.ts';
  import {
    TITLE_PREFERENCES,
    TitlePreferences,
  } from '#lib/client/title-preferences.svelte.ts';
  import { markAppNavigation } from '#lib/client/history.ts';
  let { children, data } = $props();
  const i18n = new I18n(
    untrack(() => data.i18n.language),
    untrack(() => data.i18n.siteTitle),
    untrack(() => data.i18n.tagline),
  );
  setContext(I18N, i18n);
  const preferences = new TitlePreferences(
    untrack(() => data.appearance.theme),
    i18n,
    invalidateAll,
  );
  setContext(TITLE_PREFERENCES, preferences);
  afterNavigate(({ from }) => {
    if (from) markAppNavigation();
  });
  $effect(() => {
    i18n.language = data.i18n.language;
    i18n.siteTitle = data.i18n.siteTitle;
    i18n.tagline = data.i18n.tagline;
  });
  // Also follows the setup page's unsaved language preview.
  $effect(() => {
    document.documentElement.lang = i18n.language;
  });
  $effect(() => {
    const root = document.documentElement;
    preferences.theme = data.appearance.theme;
    root.dataset.theme = data.appearance.theme;
    root.dataset.density = data.appearance.density;
    root.dataset.collapse = String(data.appearance.collapseLongNotes);
  });
</script>

{@render children()}
