import { getContext } from 'svelte';
import {
  translate,
  type MessageKey,
  type MessageParams,
} from '#lib/shared/i18n/index.ts';
import { DEFAULT_LANGUAGE, type Language } from '#lib/shared/i18n/registry.ts';

/** Reactive language + site identity for the current page tree. */
export class I18n {
  language = $state<Language>(DEFAULT_LANGUAGE);
  siteTitle = $state('PandaNote');
  constructor(language: Language = DEFAULT_LANGUAGE, siteTitle = 'PandaNote') {
    this.language = language;
    this.siteTitle = siteTitle;
  }
  t = (key: MessageKey, params?: MessageParams): string =>
    translate(this.language, key, params);
  /** Browser-tab title: `<page> · <site title>`. */
  pageTitle = (page: string): string => `${page} · ${this.siteTitle}`;
}
export const I18N = Symbol('pandanote-i18n');
const fallback = new I18n();
/** English defaults outside the root layout (isolated component fixtures). */
export function useI18n(): I18n {
  return getContext<I18n | undefined>(I18N) ?? fallback;
}
