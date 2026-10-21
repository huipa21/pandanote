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
    | 'forward'
    | 'search'
    | 'settings'
    | 'template'
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
    | 'camera'
    | 'lightbulb'
    | 'rocket'
    | 'target'
    | 'clock'
    | 'calendar'
    | 'mail'
    | 'phone'
    | 'chat'
    | 'code'
    | 'lock'
    | 'key'
    | 'chart'
    | 'trophy'
    | 'coffee'
    | 'price-tag'
    | 'car'
    | 'plane'
    | 'leaf'
    | 'music'
    | 'gift'
    | 'cart'
    | 'umbrella'
    | 'compass'
    | 'paw';
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
    {:else if name === 'forward'}
      <path d="M5 12h14M13 6l6 6-6 6" />
    {:else if name === 'search'}
      <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" />
    {:else if name === 'settings'}
      <path
        d="m10 3-.5 3-2 1-2.8-1L2.8 9l2.3 2v2l-2.3 2 1.9 3 2.8-1 2 1 .5 3h4l.5-3 2-1 2.8 1 1.9-3-2.3-2v-2l2.3-2-1.9-3-2.8 1-2-1L14 3Z"
      />
      <circle cx="12" cy="12" r="3" />
    {:else if name === 'template'}
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 8h16M9 8v13M12 12h5M12 16h5" />
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
    {:else if name === 'lightbulb'}
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2c.6.4 1 1.1 1 1.8h4c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"
      />
    {:else if name === 'rocket'}
      <path
        d="M12 2c3 2 5 6 5 10 0 1.8-.4 3.3-1 4.5L12 22l-4-5.5C7.4 15.3 7 13.8 7 12c0-4 2-8 5-10Z"
      /><circle cx="12" cy="10" r="1.6" /><path d="M8 17l-3 3M16 17l3 3" />
    {:else if name === 'target'}
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle
        cx="12"
        cy="12"
        r="1.2"
      />
    {:else if name === 'clock'}
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
    {:else if name === 'calendar'}
      <rect x="3" y="5" width="18" height="16" rx="2" /><path
        d="M3 10h18M8 3v4M16 3v4"
      />
    {:else if name === 'mail'}
      <rect x="3" y="5" width="18" height="14" rx="2" /><path
        d="m4 6 8 7 8-7"
      />
    {:else if name === 'phone'}
      <path
        d="M6 3h3l1.5 4-2 2a12 12 0 0 0 6.5 6.5l2-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 6.2 2 2 0 0 1 6 3Z"
      />
    {:else if name === 'chat'}
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" />
    {:else if name === 'code'}
      <path d="m9 8-5 4 5 4M15 8l5 4-5 4" />
    {:else if name === 'lock'}
      <rect x="4" y="11" width="16" height="9" rx="2" /><path
        d="M8 11V7a4 4 0 0 1 8 0v4"
      />
    {:else if name === 'key'}
      <circle cx="7.5" cy="12" r="3.5" /><path
        d="M10.8 12H20M16 12v3M19 12v3"
      />
    {:else if name === 'chart'}
      <path d="M4 20V11M10 20V4M16 20v-6" /><path d="M3 20h18" />
    {:else if name === 'trophy'}
      <path d="M7 4h10v4a5 5 0 0 1-10 0Z" /><path
        d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M10 16v2h4v-2M9 21h6"
      />
    {:else if name === 'coffee'}
      <path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" /><path
        d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c-.5 1 .5 1.5 0 2.5M12 3c-.5 1 .5 1.5 0 2.5"
      />
    {:else if name === 'price-tag'}
      <path d="M3 3h8l10 10-8 8L3 11Z" /><circle cx="7.5" cy="7.5" r="1.2" />
    {:else if name === 'car'}
      <path d="M4 16V12l2-5h12l2 5v4" /><path
        d="M4 16h16M7 16v2M17 16v2"
      /><circle cx="7.5" cy="16" r="1.3" /><circle cx="16.5" cy="16" r="1.3" />
    {:else if name === 'plane'}
      <path d="M3 11 21 3l-6 18-4-7Z" /><path d="M11 14 21 3" />
    {:else if name === 'leaf'}
      <path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16Z" /><path
        d="M6 18C10 14 14 10 19 5"
      />
    {:else if name === 'music'}
      <path d="M9 18V5l10-2v13" /><circle cx="7" cy="18" r="2.2" /><circle
        cx="17"
        cy="16"
        r="2.2"
      />
    {:else if name === 'gift'}
      <rect x="4" y="9" width="16" height="11" rx="1" /><path
        d="M4 9h16M12 9v11M12 9c-2-4-6-4-6-1s4 1 6 1Zm0 0c2-4 6-4 6-1s-4 1-6 1Z"
      />
    {:else if name === 'cart'}
      <path
        d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.2a2 2 0 0 0 2-1.6L20 8H6"
      /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" />
    {:else if name === 'umbrella'}
      <path d="M12 2v2M12 12v7a2 2 0 0 1-2 2" /><path
        d="M12 4a9 9 0 0 1 9 8H3a9 9 0 0 1 9-8Z"
      />
    {:else if name === 'compass'}
      <circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5Z" />
    {:else if name === 'paw'}
      <circle cx="7" cy="9" r="1.6" /><circle cx="11" cy="6.5" r="1.6" /><circle
        cx="15"
        cy="6.5"
        r="1.6"
      /><circle cx="18" cy="9" r="1.6" /><path
        d="M12 12c-3.5 0-6 2-6 4.5S8 20 12 20s6-1 6-3.5S15.5 12 12 12Z"
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
