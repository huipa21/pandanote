<script lang="ts">
  import { onMount } from 'svelte';
  import AuthForm from '#lib/components/AuthForm.svelte';
  import { SIDEBAR_WIDTH_KEY } from '#lib/client/sidebar-size.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  const t = useI18n().t;
  let widthStorageError = $state(false);
  onMount(() => {
    try {
      sessionStorage.removeItem(SIDEBAR_WIDTH_KEY);
    } catch {
      widthStorageError = true;
    }
  });
</script>

{#if widthStorageError}<p role="alert">
    {t('shell.widthStorageUnavailable')}
  </p>{/if}
<AuthForm />
