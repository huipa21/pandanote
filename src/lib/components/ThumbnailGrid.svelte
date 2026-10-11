<script lang="ts">
  let {
    images,
    disabled = false,
    onOpen,
  }: {
    images: readonly { id: string; url: string; filename: string }[];
    disabled?: boolean;
    onOpen: (id: string) => void;
  } = $props();
</script>

{#if images.length}
  <ul class="grid" aria-label="Note images">
    {#each images as image, index (image.id)}
      <li>
        <button
          type="button"
          {disabled}
          aria-label="Open image {index + 1}: {image.filename}"
          onclick={() => onOpen(image.id)}
          ><img
            src={image.url}
            alt=""
            loading="lazy"
            decoding="async"
          /></button
        >
      </li>
    {/each}
  </ul>
{/if}

<style>
  .grid {
    --tile: min(7rem, calc((100% - 2 * var(--space-1)) / 3));
    display: grid;
    grid-template-columns: repeat(3, var(--tile));
    gap: var(--space-1);
    list-style: none;
    margin: var(--space-2) 0;
    padding: 0;
  }
  li {
    aspect-ratio: 1;
  }
  button {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) / 2);
    overflow: hidden;
    background: var(--accent-soft);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
