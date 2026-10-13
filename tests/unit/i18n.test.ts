import { expect, it } from 'vitest';
import { en } from '../../src/lib/shared/i18n/en.ts';
import { zhCN } from '../../src/lib/shared/i18n/zh-CN.ts';
import { translate } from '../../src/lib/shared/i18n/index.ts';
import {
  browserLanguage,
  catalogFor,
  languageCodes,
  languageInfo,
  languages,
  matchAcceptLanguage,
  matchLanguageTag,
} from '../../src/lib/shared/i18n/registry.ts';
import {
  generalSettingsSchema,
  languageSchema,
} from '../../src/lib/shared/settings.ts';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

it('registry lists exactly the catalogs, each in its own language, with honest completeness', () => {
  expect(languages.map((l) => l.code)).toEqual([...languageCodes]);
  expect(languages.map((l) => [l.code, l.nativeName])).toEqual([
    ['en', 'English'],
    ['zh-CN', '简体中文'],
  ]);
  expect(languageInfo('en').complete).toBe(true);
  expect(languageInfo('zh-CN').complete).toBe(true);
  expect(languageSchema.options).toEqual([...languageCodes]);
  for (const bad of ['fr', 'zh-TW', 'EN', 'zh-cn', '', 'en ', null, 1])
    expect(languageSchema.safeParse(bad).success).toBe(false);
});
it('every translated key exists in English, keeps its placeholders and is non-empty', () => {
  for (const [key, value] of Object.entries(zhCN)) {
    expect(key in en, key).toBe(true);
    expect(value.trim().length, key).toBeGreaterThan(0);
    expect(placeholders(value), key).toEqual(
      placeholders(en[key as keyof typeof en]),
    );
  }
  // Every screen is translated: every English key exists in Simplified Chinese.
  for (const key of Object.keys(en))
    expect(catalogFor('zh-CN')[key as keyof typeof en], key).toBeDefined();
});
it('translates per key with English fallback and fills placeholders', () => {
  expect(translate('en', 'auth.signIn')).toBe('Sign in');
  expect(translate('zh-CN', 'auth.signIn')).toBe('登录');
  expect(translate('zh-CN', 'shell.allTags', { count: 7 })).toContain('7');
  expect(translate('en', 'brand.home', { title: 'Mine' })).toBe('Mine home');
  expect(translate('en', 'brand.home')).toBe('{title} home');
  // A key missing from the partial catalog falls back to English individually.
  const original = zhCN['auth.signIn'];
  delete zhCN['auth.signIn'];
  try {
    expect(translate('zh-CN', 'auth.signIn')).toBe('Sign in');
    expect(translate('zh-CN', 'auth.username')).toBe('用户名');
  } finally {
    zhCN['auth.signIn'] = original;
  }
  // Placeholder values are inserted literally, never interpreted.
  expect(translate('en', 'brand.home', { title: '$& {title}' })).toBe(
    '$& {title} home',
  );
});
it('matches language tags: Simplified Chinese only, English otherwise', () => {
  for (const tag of [
    'zh',
    'zh-CN',
    'zh_cn',
    'ZH-cn',
    'zh-Hans',
    'zh-Hans-CN',
    'zh-SG',
  ])
    expect(matchLanguageTag(tag), tag).toBe('zh-CN');
  for (const tag of ['en', 'en-US', 'EN-gb'])
    expect(matchLanguageTag(tag), tag).toBe('en');
  for (const tag of [
    'zh-TW',
    'zh-HK',
    'zh-MO',
    'zh-Hant',
    'zh-Hant-TW',
    'fr',
    'zhx',
    '*',
    '',
  ])
    expect(matchLanguageTag(tag), tag).toBeNull();
  expect(browserLanguage(['zh-TW', 'zh-CN'])).toBe('zh-CN');
  expect(browserLanguage(['fr', 'de'])).toBe('en');
  expect(browserLanguage([])).toBe('en');
});
it('parses Accept-Language with q-values, ties, malformed entries and bounds', () => {
  expect(matchAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh-CN');
  expect(matchAcceptLanguage('en;q=0.5, zh-CN;q=0.9')).toBe('zh-CN');
  // Header order breaks ties.
  expect(matchAcceptLanguage('zh-CN;q=0.2, en;q=0.2')).toBe('zh-CN');
  expect(matchAcceptLanguage('zh-CN;q=0, en')).toBe('en');
  expect(matchAcceptLanguage('zh-TW')).toBe('en');
  expect(matchAcceptLanguage('zh-TW, zh-CN;q=0.5')).toBe('zh-CN');
  expect(matchAcceptLanguage('fr-FR, de;q=0.7')).toBe('en');
  expect(matchAcceptLanguage('zh-CN;q=abc, en;q=1')).toBe('zh-CN');
  expect(matchAcceptLanguage('zh-CN;q=2, en')).toBe('en');
  for (const bad of [
    undefined,
    null,
    '',
    ' , ;;; ',
    '<script>',
    '*',
    'x'.repeat(2000),
  ])
    expect(matchAcceptLanguage(bad)).toBe('en');
  // Only a bounded number of entries is considered.
  expect(matchAcceptLanguage(`${'fr,'.repeat(40)}zh-CN`)).toBe('en');
});
it('validates Settings → General requests strictly', () => {
  expect(generalSettingsSchema.parse({ language: 'zh-CN' })).toEqual({
    language: 'zh-CN',
  });
  expect(generalSettingsSchema.parse({ siteTitle: '  笔记  ' })).toEqual({
    siteTitle: '笔记',
  });
  for (const bad of [
    {},
    { language: 'fr' },
    { siteTitle: '   ' },
    { siteTitle: 'x'.repeat(61) },
    { siteTitle: 'line\nbreak' },
    { language: 'en', timezone: 'UTC' },
    null,
  ])
    expect(generalSettingsSchema.safeParse(bad).success).toBe(false);
});
