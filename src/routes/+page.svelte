<svelte:head>
  <title>PandaNote</title>
  <meta name="description" content="PandaNote technical bootstrap" />
</svelte:head>

<main>
  <h1>PandaNote</h1>
  <p>Technical bootstrap. Note-taking features are not implemented yet.</p>
  <a href="/health">Service health</a>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #faf9f6;
    color: #242b25;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
  }
  main {
    max-width: 48rem;
    margin: 3rem auto;
    padding: 1.25rem;
  }
  a {
    color: #3f6b4d;
  }
  a:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
  }
</style>
