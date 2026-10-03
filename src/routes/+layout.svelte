<script lang="ts">
  import '#lib/styles/tokens.css';
  import '#lib/styles/global.css';
  let { children, data } = $props();
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.appearance.theme;
    root.dataset.density = data.appearance.density;
    root.dataset.collapse = String(data.appearance.collapseLongNotes);
  });
</script>

{@render children()}
