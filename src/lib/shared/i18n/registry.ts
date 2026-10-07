// Catalog translation and saved-language rendering are SS04. This registry is
// already authoritative for setup validation and its picker.
export const languages = [
  { code: 'en', nativeName: 'English', complete: true },
  { code: 'zh-CN', nativeName: '简体中文', complete: false },
] as const;
export type Language = (typeof languages)[number]['code'];
export function browserLanguage(values: readonly string[]): Language {
  for (const value of values) {
    const tag = value.toLowerCase();
    if (tag === 'zh-cn' || tag.startsWith('zh-cn-')) return 'zh-CN';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
