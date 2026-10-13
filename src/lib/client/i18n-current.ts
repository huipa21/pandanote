import {
  translate,
  type MessageKey,
  type MessageParams,
} from '#lib/shared/i18n/index.ts';
import { DEFAULT_LANGUAGE, type Language } from '#lib/shared/i18n/registry.ts';

/**
 * Language used by non-component client code (editor, retry and upload state) that
 * cannot read Svelte context. The root I18n instance keeps it in sync.
 */
let current: Language = DEFAULT_LANGUAGE;

export function setCurrentLanguage(language: Language): void {
  // Server renders run concurrently for different visitors; only the browser has one user.
  if (typeof window === 'undefined') return;
  current = language;
}

export function currentLanguage(): Language {
  return current;
}

/** Translate outside components. Messages are stored when produced, so text
 * already displayed keeps the language it was created in until replaced. */
export function tr(key: MessageKey, params?: MessageParams): string {
  return translate(current, key, params);
}
