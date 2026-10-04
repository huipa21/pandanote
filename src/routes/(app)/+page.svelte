<script lang="ts">
  import { getContext } from 'svelte';
  import {
    DRAFT_WORKSPACE,
    type DraftWorkspace,
  } from '#lib/client/drafts/workspace.svelte.ts';
  import Markdown from '#lib/components/Markdown.svelte';
  const workspace = getContext<DraftWorkspace>(DRAFT_WORKSPACE);
</script>

<svelte:head
  ><title>All notes — PandaNote</title><meta
    name="description"
    content="Your private personal notebook"
  /></svelte:head
>
<section class="surface">
  <h1>All notes</h1>
  <p>A quiet place for the things you want to remember.</p>
  <p class="help">You are signed in.</p>
  <p class="muted">
    Posting is ready. Below are up to 30 notes saved during this session,
    ordered by timeline date. The full saved-note timeline and pagination arrive
    in S09.
  </p>
  {#if workspace.status === 'Saved on server.'}<p role="status">
      Saved on server.
    </p>{/if}
</section>
{#each workspace.posted as note (note.id)}
  <article class="surface" data-testid="posted-note" data-note-id={note.id}>
    <time datetime={new Date(note.timelineAt).toISOString()}
      >{new Date(note.timelineAt).toLocaleString(undefined, {
        timeZone: workspace.timezone,
      })}</time
    >
    <Markdown
      source={note.bodyMarkdown}
      images={(note.attachments ?? [])
        .filter((a) => a.kind === 'image')
        .map((a) => ({
          id: a.id,
          url: `/api/attachments/${a.id}/display`,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
        }))}
    />
    {#each (note.attachments ?? []).filter((a) => a.kind === 'file') as attachment (attachment.id)}
      <p>
        <a href={`/api/attachments/${attachment.id}/file`} download
          >{attachment.filename}</a
        >
        · {attachment.storedBytes} bytes
      </p>
    {/each}
  </article>
{/each}
