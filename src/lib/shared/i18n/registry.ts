import { en, type Catalog, type MessageKey } from './en.ts';
import { zhCN } from './zh-CN.ts';

/** Code registry of translation catalogs. Pickers list exactly this array. */
export const languageCodes = ['en', 'zh-CN'] as const;
export type Language = (typeof languageCodes)[number];
export const DEFAULT_LANGUAGE: Language = 'en';
const catalogs: Record<Language, Partial<Catalog>> = { en, 'zh-CN': zhCN };
const nativeNames: Record<Language, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};
/** Declared product coverage, not just key coverage: Chinese covers only the planned
 * screens, so it stays partial (and Settings says so) until the whole UI is translated. */
const fullyTranslatedUi: Record<Language, boolean> = {
  en: true,
  'zh-CN': false,
};
const keys = Object.keys(en) as MessageKey[];
export interface LanguageInfo {
  code: Language;
  nativeName: string;
  /** True only when the whole UI is translated and every English key has a translation. */
  complete: boolean;
}
export const languages: readonly LanguageInfo[] = languageCodes.map((code) => ({
  code,
  nativeName: nativeNames[code],
  complete:
    fullyTranslatedUi[code] &&
    keys.every((key) => typeof catalogs[code][key] === 'string'),
}));
export function languageInfo(code: Language): LanguageInfo {
  return languages.find((language) => language.code === code)!;
}
export function catalogFor(language: Language): Partial<Catalog> {
  return catalogs[language];
}

/** Match one BCP 47 tag. Simplified Chinese: bare `zh`, `zh-CN`, `zh-SG`, `zh-Hans*`.
 * Traditional (`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant*`) is deliberately not matched. */
export function matchLanguageTag(raw: string): Language | null {
  const [primary, ...rest] = raw
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .split('-');
  if (primary === 'en') return 'en';
  if (primary === 'zh') {
    if (
      rest.includes('hant') ||
      rest.some((p) => ['tw', 'hk', 'mo'].includes(p))
    )
      return null;
    if (!rest.length || rest.some((p) => ['cn', 'sg', 'hans'].includes(p)))
      return 'zh-CN';
  }
  return null;
}
/** First match in the user's preference order, else English. */
export function browserLanguage(values: readonly string[]): Language {
  for (const value of values) {
    const match = matchLanguageTag(value);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
}
/** `Accept-Language` best match: honours q-values (stable for ties); q=0 and
 * malformed entries are ignored; bounded input; English fallback. */
export function matchAcceptLanguage(
  header: string | null | undefined,
): Language {
  if (!header || header.length > 1024) return DEFAULT_LANGUAGE;
  const entries: { tag: string; q: number; order: number }[] = [];
  header
    .split(',')
    .slice(0, 32)
    .forEach((part, order) => {
      const [tag, ...params] = part.trim().split(';');
      if (!tag || !/^[A-Za-z*][A-Za-z0-9_-]{0,34}$/.test(tag.trim())) return;
      let q = 1;
      for (const param of params) {
        const m = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(param);
        if (m) q = Number(m[1]);
      }
      if (q > 0 && q <= 1) entries.push({ tag: tag.trim(), q, order });
    });
  entries.sort((a, b) => b.q - a.q || a.order - b.order);
  return browserLanguage(entries.map((entry) => entry.tag));
}
