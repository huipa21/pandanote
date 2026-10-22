<script lang="ts">
  import { getContext } from 'svelte';
  import { VAULT, type VaultControls } from '#lib/client/vault.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import Icon from './Icon.svelte';
  let { rail = false }: { rail?: boolean } = $props();
  const vault = getContext<VaultControls | undefined>(VAULT);
  const t = useI18n().t;
  const label = $derived(t(vault?.open ? 'vault.close' : 'vault.title'));
</script>

<button
  class:rail
  type="button"
  disabled={!vault || vault.busy}
  title={label}
  aria-label={label}
  onclick={() => vault?.activate()}
  >{#if rail}<Icon name="lock" />{:else}{label}{/if}</button
>

<style>
  button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    border: 0;
    background: transparent;
    color: inherit;
    padding: var(--space-1) 0;
    min-height: var(--row-target);
    font: inherit;
    cursor: pointer;
    border-radius: var(--radius);
  }
  button:hover:not(:disabled) {
    color: var(--accent);
    background: var(--accent-soft);
  }
  button.rail {
    justify-content: center;
    width: var(--target);
    min-height: var(--target);
    padding: 0;
    margin-inline: auto;
  }
</style>
