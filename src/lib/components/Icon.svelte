<script module lang="ts">
  /** Small stroke icon set for action menus (16–18 px, inherits text colour). */
  export type IconName =
    | 'sun'
    | 'moon'
    | 'language'
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
    | 'back'
    | 'star'
    | 'heart'
    | 'flag'
    | 'bookmark'
    | 'folder'
    | 'briefcase'
    | 'book'
    | 'home'
    | 'warning'
    | 'info'
    | 'check-circle'
    | 'camera';
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
    {#if name === 'sun'}
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
      />
    {:else if name === 'moon'}
      <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />
    {:else if name === 'language'}
      <path
        d="M3 5h12M9 3v2M5 5c0 5 4 9 8 10M13 5c-1 5-4 8-9 10M13 21l4-10 4 10M14.5 17h5"
      />
    {:else if name === 'pin'}
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
    {:else if name === 'star'}
      <path
        d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z"
      />
    {:else if name === 'heart'}
      <path
        d="M12 20.5s-7.5-4.6-9.8-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.8 11.5c-2.3 4.4-9.8 9-9.8 9Z"
      />
    {:else if name === 'flag'}
      <path d="M5 3v18M5 4h12l-3 4 3 4H5" />
    {:else if name === 'bookmark'}
      <path d="M6 3h12v18l-6-4-6 4Z" />
    {:else if name === 'folder'}
      <path
        d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"
      />
    {:else if name === 'briefcase'}
      <path
        d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"
      />
    {:else if name === 'book'}
      <path
        d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Zm0 0v13a3 3 0 0 0 3 3"
      />
    {:else if name === 'home'}
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    {:else if name === 'warning'}
      <path d="M12 3 2 21h20ZM12 10v4M12 17.5v.01" />
    {:else if name === 'info'}
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" />
    {:else if name === 'check-circle'}
      <circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />
    {:else if name === 'camera'}
      <path d="M4 8h3l2-2h6l2 2h3v11H4Z" /><circle cx="12" cy="13" r="3.2" />
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
