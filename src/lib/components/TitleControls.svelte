<script lang="ts">
  import { titlePreferences } from '#lib/client/title-preferences.svelte.ts';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import { languages } from '#lib/shared/i18n/registry.ts';
  import Icon from './Icon.svelte';
  const preferences = titlePreferences()!;
  const i18n = useI18n();
  const t = i18n.t;
  const nextLanguage = $derived(
    languages[
      (languages.findIndex((item) => item.code === i18n.language) + 1) %
        languages.length
    ],
  );
  const themeLabel = $derived(
    t(preferences.dark ? 'shell.switchLight' : 'shell.switchDark'),
  );
  const languageLabel = $derived(
    t('shell.switchLanguage', { language: nextLanguage.nativeName }),
  );
</script>

<div class="title-controls" aria-busy={preferences.busy}>
  <button
    type="button"
    aria-label={themeLabel}
    title={themeLabel}
    disabled={!preferences.ready || preferences.busy}
    onclick={() => preferences.toggle('theme')}
  >
    <Icon name={preferences.dark ? 'sun' : 'moon'} />
  </button>
  <button
    type="button"
    aria-label={languageLabel}
    title={languageLabel}
    disabled={!preferences.ready || preferences.busy}
    onclick={() => preferences.toggle('language')}
  >
    <Icon name="language" />
  </button>
</div>
{#if preferences.error}<p class="preference-error" role="alert">
    {preferences.error}
  </p>{/if}

<style>
  .title-controls {
    display: flex;
    flex: none;
    gap: var(--space-1);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--row-target);
    min-height: var(--row-target);
    padding: var(--space-1);
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }
  button:hover:not(:disabled) {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .preference-error {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.75rem;
    color: var(--danger);
  }
  @media (max-width: 899px) {
    button {
      min-width: var(--target);
      min-height: var(--target);
    }
  }
</style>
