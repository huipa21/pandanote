<script module lang="ts">
  /** Small stroke icon set for action menus (16–18 px, inherits text colour). */
  export type IconName =
    | 'pin'
    | 'pin-off'
    | 'pencil'
    | 'trash'
    | 'restore'
    | 'delete-forever'
    | 'select-none'
    | 'select-some'
    | 'select-all'
    | 'merge'
    | 'dots'
    | 'back';
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
</script>

{#if name === 'dots'}
  <svg class="icon icon-fill" aria-hidden="true" viewBox="0 0 20 20"
    ><circle cx="4.5" cy="10" r="1.6" /><circle
      cx="10"
      cy="10"
      r="1.6"
    /><circle cx="15.5" cy="10" r="1.6" /></svg
  >
{:else}
  <svg class="icon" aria-hidden="true" viewBox="0 0 24 24">
    {#if name === 'pin'}
      <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    {:else if name === 'pin-off'}
      <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6ZM3 3l18 18" />
    {:else if name === 'pencil'}
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
    {:else if name === 'back'}
      <path d="M19 12H5M11 6l-6 6 6 6" />
    {:else if name === 'restore'}
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5" />
    {:else if name === 'select-none'}
      <rect x="4" y="4" width="16" height="16" rx="3" />
    {:else if name === 'select-some'}
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12h8" />
    {:else if name === 'select-all'}
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    {:else if name === 'delete-forever'}
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11l4 5M14 11l-4 5" />
    {:else if name === 'merge'}
      <path
        d="M6 4v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v4M18 4v4a4 4 0 0 1-4 4M6 20v-4"
      />
    {:else}
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    {/if}
  </svg>
{/if}

<style>
  .icon {
    width: 1.125rem;
    height: 1.125rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon-fill {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
    stroke: none;
  }
</style>
