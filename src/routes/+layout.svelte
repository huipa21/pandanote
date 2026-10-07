<script lang="ts">
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  import { setContext, untrack } from 'svelte';
  import { I18N, I18n } from '#lib/client/i18n.svelte.ts';
  let { children, data } = $props();
  const i18n = new I18n(
    untrack(() => data.i18n.language),
    untrack(() => data.i18n.siteTitle),
  );
  setContext(I18N, i18n);
  $effect(() => {
    i18n.language = data.i18n.language;
    i18n.siteTitle = data.i18n.siteTitle;
  });
  // Also follows the setup page's unsaved language preview.
  $effect(() => {
    document.documentElement.lang = i18n.language;
  });
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.appearance.theme;
    root.dataset.density = data.appearance.density;
    root.dataset.collapse = String(data.appearance.collapseLongNotes);
  });
</script>

{@render children()}
