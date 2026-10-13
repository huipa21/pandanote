import { getContext } from 'svelte';
import { appearanceSchema, type Appearance } from '#lib/shared/appearance.ts';
import { settingsSchema } from '#lib/shared/settings.ts';
import { languages } from '#lib/shared/i18n/registry.ts';
import type { I18n } from './i18n.svelte.ts';

export const TITLE_PREFERENCES = Symbol('pandanote-title-preferences');
const savedLanguageSchema = settingsSchema.pick({ language: true }).strip();

/** One request owner for desktop, mobile header and drawer controls. */
export class TitlePreferences {
  theme = $state<Appearance['theme']>('system');
  systemDark = $state(false);
  ready = $state(false);
  busy = $state(false);
  error = $state('');
  i18n: I18n;
  refresh: () => Promise<unknown>;

  constructor(
    theme: Appearance['theme'],
    i18n: I18n,
    refresh: () => Promise<unknown>,
  ) {
    this.theme = theme;
    this.i18n = i18n;
    this.refresh = refresh;
  }

  get dark(): boolean {
    return (
      this.theme === 'dark' || (this.theme === 'system' && this.systemDark)
    );
  }

  mount(): () => void {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => (this.systemDark = media.matches);
    changed();
    this.ready = true;
    media.addEventListener('change', changed);
    return () => {
      this.ready = false;
      media.removeEventListener('change', changed);
    };
  }

  async toggle(kind: 'theme' | 'language'): Promise<void> {
    if (!this.ready || this.busy) return;
    this.busy = true;
    this.error = '';
    const theme = this.dark ? 'light' : 'dark';
    const next =
      (languages.findIndex((item) => item.code === this.i18n.language) + 1) %
      languages.length;
    try {
      const response = await fetch(
        `/api/settings/${kind === 'theme' ? 'appearance' : 'general'}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          // Partial merges never overwrite density, title, tagline or unsaved General choices.
          body: JSON.stringify(
            kind === 'theme' ? { theme } : { language: languages[next].code },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        this.error = result.error
          ? this.i18n.error(result.error)
          : this.i18n.t('shell.preferencesFailed');
        return;
      }
      // Apply only confirmed, validated state. No browser-storage preference cache.
      if (kind === 'theme') {
        this.theme = appearanceSchema.parse(result.appearance).theme;
        document.documentElement.dataset.theme = this.theme;
      } else {
        this.i18n.language = savedLanguageSchema.parse(result.data).language;
        document.documentElement.lang = this.i18n.language;
      }
      await this.refresh();
    } catch {
      this.error = this.i18n.t('shell.preferencesFailed');
    } finally {
      this.busy = false;
    }
  }
}

export function titlePreferences(): TitlePreferences | undefined {
  return getContext<TitlePreferences | undefined>(TITLE_PREFERENCES);
}
