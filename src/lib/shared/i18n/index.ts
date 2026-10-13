import { en, type MessageKey } from './en.ts';
import { catalogFor, type Language } from './registry.ts';

export type { MessageKey } from './en.ts';
export type MessageParams = Record<string, string | number>;
/** Per-key fallback: selected catalog, then English. Unknown placeholders stay literal. */
export function translate(
  language: Language,
  key: MessageKey,
  params?: MessageParams,
): string {
  const template = catalogFor(language)[key] ?? en[key];
  return params
    ? template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole,
      )
    : template;
}

/** The text-bearing part of an API error (or a page-loader error). */
export interface ErrorText {
  message: string;
  messageKey?: MessageKey;
  messageParams?: MessageParams;
}
/** Localizes a server error: stable key first, then exact English text, else as received. */
export function errorText(language: Language, error: ErrorText): string {
  return error.messageKey && error.messageKey in en
    ? translate(language, error.messageKey, error.messageParams)
    : localizeMessage(language, error.message);
}

const englishKeys = new Map<string, MessageKey>(
  (Object.keys(en) as MessageKey[]).map((key) => [en[key], key]),
);
/** Localizes a message that is known by its English text (validation and server
 * field messages). Unknown text is returned unchanged. */
export function localizeMessage(language: Language, text: string): string {
  const key = englishKeys.get(text);
  return key ? translate(language, key) : text;
}
