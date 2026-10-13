<script lang="ts">
  import { page } from '$app/state';
  import PageTitle from '#lib/components/PageTitle.svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  const i18n = useI18n();
  const t = i18n.t;
  // Loader errors carry a stable catalog key; the English text is only a fallback.
  const message = $derived(
    i18n.error({
      message: page.error?.message ?? '',
      messageKey: page.error?.messageKey,
    }),
  );
</script>

<PageTitle title={t('note.title')} />
<section class="surface">
  <p role="alert">{message}</p>
  <a href="/">{t('note.back')}</a>
</section>
