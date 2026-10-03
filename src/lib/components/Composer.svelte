<script lang="ts">
  import { tick } from 'svelte';
  import Modal from './Modal.svelte';
  let text = $state('');
  let expanded = $state(false);
  let editorOpen = $state(false);
  let textarea = $state<HTMLTextAreaElement>();
  async function expand() {
    expanded = true;
    await tick();
    textarea?.focus();
  }
  $effect(() => {
    if (!text) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
</script>

<div class="desktop-composer surface" data-testid="composer">
  {#if !expanded}
    <button class="start-writing" onfocus={expand} onclick={expand}
      >Write a note…</button
    >
  {:else}
    <label class="sr-only" for="compact-note-text">Note text</label>
    <textarea
      id="compact-note-text"
      bind:this={textarea}
      bind:value={text}
      rows="3"
      placeholder="A thought, a small discovery…"
      aria-describedby="composer-help"></textarea>
    <div class="composer-actions">
      <button
        onclick={() => {
          editorOpen = true;
        }}>Expand editor</button
      >
      <button
        onclick={() => {
          expanded = false;
        }}
        disabled={Boolean(text)}>Collapse editor</button
      >
      <button class="primary" disabled>Post</button>
    </div>
    <p class="help" id="composer-help">
      Editor shell only. Text is not saved yet (S05); posting comes in S08. Keep
      a copy before leaving.
    </p>
  {/if}
</div>
<button
  class="mobile-compose primary"
  onclick={() => {
    editorOpen = true;
  }}>{text ? 'Continue writing' : 'Compose a note'}</button
>

<Modal bind:open={editorOpen} title="Write a note" kind="editor">
  <label class="sr-only" for="expanded-note-text">Note text</label>
  <textarea
    id="expanded-note-text"
    class="expanded-text"
    bind:value={text}
    data-initial-focus
    aria-describedby="expanded-help"
    placeholder="A thought, a small discovery…"></textarea>
  <div class="editor-footer">
    <p class="help" id="expanded-help">
      <span class="full-help"
        >Text stays here while navigating this shell, but is not saved on
        reload. Draft recovery comes in S05; posting comes in S08.</span
      >
      <span class="short-help"
        >Not saved yet. Draft recovery: S05; posting: S08.</span
      >
    </p>
    <button class="primary" disabled>Post</button>
  </div>
</Modal>

<style>
  .desktop-composer {
    padding: var(--space-3);
  }
  .start-writing {
    width: 100%;
    text-align: left;
    color: var(--muted);
    border: 0;
  }
  textarea {
    width: 100%;
    display: block;
    resize: none;
  }
  .composer-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-top: var(--space-2);
  }
  .composer-actions .primary {
    margin-left: auto;
  }
  .help {
    margin-bottom: 0;
  }
  .mobile-compose {
    display: none;
  }
  .expanded-text {
    flex: 1;
    min-height: 8rem;
    height: 40dvh;
  }
  .editor-footer {
    display: flex;
    flex: none;
    gap: var(--space-3);
    align-items: center;
    padding-top: var(--space-3);
  }
  .editor-footer .help {
    margin: 0;
  }
  .short-help {
    display: none;
  }
  @media (max-width: 899px) and (max-height: 400px) {
    .full-help {
      display: none;
    }
    .short-help {
      display: inline;
    }
    .editor-footer .help {
      font-size: 0.75rem;
      line-height: 1.4;
    }
  }
  @media (max-width: 899px) {
    .desktop-composer {
      display: none;
    }
    .mobile-compose {
      display: block;
      min-width: var(--target);
    }
    .expanded-text {
      height: auto;
      min-height: 0;
    }
  }
  @media (max-height: 540px) and (min-width: 900px) {
    .desktop-composer textarea {
      height: 4rem;
    }
    .desktop-composer .help {
      font-size: 0.75rem;
    }
  }
</style>
