<script lang="ts">
  let signingOut = $state(false);
  let message = $state('');
  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    message = '';
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok || response.status === 401) {
        window.location.assign('/login');
        return;
      }
      message = 'Could not sign out. Please retry.';
    } catch {
      message = 'Could not reach the server. Please retry signing out.';
    } finally {
      signingOut = false;
    }
  }
</script>

<svelte:head>
  <title>PandaNote</title>
  <meta name="description" content="PandaNote technical bootstrap" />
</svelte:head>

<main>
  <h1>PandaNote</h1>
  <p>Technical bootstrap. Note-taking features are not implemented yet.</p>
  <p>
    You are signed in. Security settings and optional MFA are still being
    implemented.
  </p>
  <button onclick={signOut} disabled={signingOut}
    >{signingOut ? 'Signing out…' : 'Sign out'}</button
  >
  <p>
    Local drafts, once implemented, remain on this device when you sign out.
  </p>
  <p role="alert">{message}</p>
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
  button {
    padding: 0.7rem 1rem;
    background: #3f6b4d;
    color: white;
    border: 0;
    border-radius: 0.3rem;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
  }
</style>
