<script lang="ts">
  import '../../src/lib/styles/tokens.css';
  import '../../src/lib/styles/global.css';
  import AppShell from '../../src/lib/components/AppShell.svelte';
  import type { TagNode } from '../../src/lib/shared/tag-tree.ts';
  // 200 synthetic roots, a few with nested children, in count order.
  const tags: TagNode[] = Array.from({ length: 200 }, (_, i) => {
    const label = `香港-図書館-${String(i).padStart(3, '0')}`;
    return {
      key: label,
      display: label,
      label,
      count: 200 - i,
      children:
        i % 50 === 0
          ? [
              {
                key: `${label}/子`,
                display: `${label}/子`,
                label: '子',
                count: 1,
                children: [],
              },
            ]
          : [],
    };
  });
</script>

<AppShell {tags}>
  <section class="surface">
    <h1>Synthetic shell fixture</h1>
    <p>Test-only content. Not a product timeline or note renderer.</p>
  </section>
  {#each Array.from({ length: 60 }, (_, i) => i) as i (i)}
    <article class="surface">
      <h2>Synthetic note {i + 1}</h2>
      <p>今日食咗點心，之後去香港。今日は図書館に行った。</p>
      <p>
        This bounded fixture checks the actual fixed shell and independent
        scroll surface with a long collection.
      </p>
    </article>
  {/each}
</AppShell>
