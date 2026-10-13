import { getContext } from 'svelte';
import {
  translate,
  localizeMessage,
  type MessageKey,
  type MessageParams,
} from '#lib/shared/i18n/index.ts';
import {
  DEFAULT_LANGUAGE,
  localeFor,
  type Language,
} from '#lib/shared/i18n/registry.ts';
import { setCurrentLanguage } from './i18n-current.ts';

/** Reactive language + site identity for the current page tree. */
export class I18n {
  #language = $state<Language>(DEFAULT_LANGUAGE);
  siteTitle = $state('PandaNote');
  constructor(language: Language = DEFAULT_LANGUAGE, siteTitle = 'PandaNote') {
    this.language = language;
    this.siteTitle = siteTitle;
  }
  get language(): Language {
    return this.#language;
  }
  /** Setting the language also updates non-component client code synchronously. */
  set language(value: Language) {
    this.#language = value;
    setCurrentLanguage(value);
  }
  /** Intl/toLocale* locale for the current language. */
  get locale(): string {
    return localeFor(this.language);
  }
  t = (key: MessageKey, params?: MessageParams): string =>
    translate(this.language, key, params);
  /** Localizes a validation or server message known by its English text. */
  msg = (text: string): string => localizeMessage(this.language, text);
  /** Localizes every value of a field-message record. */
  msgs = (record: Record<string, string> = {}): Record<string, string> =>
    Object.fromEntries(
      Object.entries(record).map(([field, text]) => [field, this.msg(text)]),
    );
  /** Browser-tab title: `<page> · <site title>`. */
  pageTitle = (page: string): string => `${page} · ${this.siteTitle}`;
}
export const I18N = Symbol('pandanote-i18n');
const fallback = new I18n();
/** English defaults outside the root layout (isolated component fixtures). */
export function useI18n(): I18n {
  return getContext<I18n | undefined>(I18N) ?? fallback;
}
