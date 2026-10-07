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
