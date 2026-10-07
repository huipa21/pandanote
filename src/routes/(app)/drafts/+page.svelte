<script lang="ts">
  import { getContext } from 'svelte';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import {
    excerpt,
    hasContent,
    type LocalDraft,
  } from '#lib/client/drafts/model.ts';
  import Modal from '#lib/components/Modal.svelte';
  import StatusNoteList from '#lib/components/StatusNoteList.svelte';
  let { data } = $props();
  const workspace = getContext<DraftWorkspace>(DRAFT_WORKSPACE);
  let discardTarget = $state<LocalDraft | null>(null);
  let confirmDiscard = $state(false);
  async function discard(draft: LocalDraft) {
    const current =
      workspace.active?.localDraftId === draft.localDraftId
        ? workspace.active
        : draft;
    if (hasContent(current)) {
      discardTarget = current;
      confirmDiscard = true;
    } else await workspace.discard(current);
  }
</script>

<PageTitle title="Drafts" />
<section class="surface">
  <h1>Drafts</h1>
  <h2>Local drafts · this browser only</h2>
  <p>
    Text and metadata stay in this browser; files stay in IndexedDB. Nothing is
    uploaded before Post. Clearing browser data, private browsing, storage
    eviction or losing this device can remove drafts. This is recovery storage,
    not a backup, and anyone controlling this browser can read it.
  </p>
  <button
    disabled={!workspace.ready || workspace.busy || workspace.conflict}
    onclick={() => workspace.createAnother()}>Create another draft</button
  >
  <button
    disabled={!workspace.ready}
    onclick={() => workspace.requestPersistence()}
    >Request persistent storage</button
  >
  <p class="help">{workspace.persistence}</p>
  {#each workspace.warnings as warning (warning)}<p role="alert">
      {warning}
    </p>{/each}
  {#if !workspace.ready}<p>Opening browser drafts…</p>
  {:else if !workspace.drafts.length}<p>
      No saved local drafts on this browser.
    </p>
  {:else}
    <ul class="draft-list">
      {#each workspace.drafts as draft (draft.localDraftId)}
        <li data-testid="local-draft" data-draft-id={draft.localDraftId}>
          <p class="excerpt">{excerpt(draft)}</p>
          <p class="help">
            Device-only · {draft.kind === 'new'
              ? 'new unpublished draft'
              : draft.kind === 'edit-published'
                ? 'published-note edit recovery'
                : 'server-draft edit recovery'}{draft.kind !== 'new'
              ? ' (may be newer than the server)'
              : ''} · local copy {draft.localDraftId.slice(0, 8)} · {draft
              .attachments.length} attachment(s)
            {draft.postingAttempt
              ? ' · frozen save retained for safe retry'
              : ''}
            · {new Date(draft.modifiedLocallyAt).toLocaleString('en', {
              timeZone: workspace.timezone,
            })}
          </p>
          {#if draft.serverBase}<a href={`/notes/${draft.serverBase.noteId}`}
              >View server note (base revision {draft.serverBase.revision})</a
            >{/if}
          <button
            disabled={workspace.busy}
            onclick={() => workspace.resume(draft.localDraftId)}
            >Resume {excerpt(draft)}</button
          >
          <button disabled={workspace.busy} onclick={() => discard(draft)}
            >Discard {excerpt(draft)}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
{#key data.tagGeneration}<StatusNoteList
    status="draft"
    initial={data.statusList}
    initialError={data.statusError}
  />{/key}
<Modal bind:open={confirmDiscard} title="Discard local draft?">
  <p>
    This removes only this draft's saved text and local files from this browser.
    It cannot be undone. Existing server files are not deleted.
  </p>
  <button
    onclick={async () => {
      if (discardTarget && (await workspace.discard(discardTarget))) {
        confirmDiscard = false;
        discardTarget = null;
      }
    }}>Confirm discard</button
  >
</Modal>

<style>
  h1 {
    margin-top: 0;
  }
  .draft-list {
    padding: 0;
    list-style: none;
  }
  li {
    border-top: 1px solid var(--border);
    padding-block: var(--space-3);
  }
  .excerpt {
    overflow-wrap: anywhere;
  }
</style>
