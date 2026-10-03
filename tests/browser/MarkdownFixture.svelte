<script lang="ts">
  import Markdown from '../../src/lib/components/Markdown.svelte';
  import { sanitizeSvg } from '../../src/lib/client/markdown/mermaid.ts';
  import '../../src/lib/styles/tokens.css';
  import '../../src/lib/styles/global.css';
  let source = $state('## Preview\n\nPlain Markdown only.');
  let svg = $state('');
  let sanitized = $state('');
  async function stalledDiagram() {
    const { default: mermaid } = await import('mermaid');
    const original = mermaid.render;
    // Test-only fault injection for the deadline/recovery branch; normal
    // flow/sequence tests exercise the unmodified library.
    mermaid.render = () => {
      mermaid.render = original;
      return new Promise(() => {});
    };
    source = '```mermaid\nflowchart LR\n SlowTest --> B\n```';
  }
</script>

<main>
  <label for="markdown-source">Markdown source</label>
  <textarea id="markdown-source" bind:value={source}></textarea>
  <div class="output"><Markdown {source} debounce={300} /></div>
  <button onclick={stalledDiagram}>Simulate stalled Mermaid</button>
  <label for="svg-source">Hostile SVG fixture</label>
  <textarea id="svg-source" bind:value={svg}></textarea>
  <button
    onclick={() => {
      sanitized = sanitizeSvg(svg);
    }}>Sanitize production SVG</button
  >
  <div id="sanitized">
    <!-- Deliberately exercise production SVG sanitizer output in a real browser. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html sanitized}
  </div>
</main>

<style>
  main {
    max-width: 48rem;
    margin: auto;
    padding: 1rem;
  }
  textarea {
    width: 100%;
    height: 6rem;
  }
</style>
