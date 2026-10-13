import { expect, it } from 'vitest';
import { en } from '../../src/lib/shared/i18n/en.ts';
import { zhCN } from '../../src/lib/shared/i18n/zh-CN.ts';
import { localizeMessage } from '../../src/lib/shared/i18n/index.ts';
import {
  currentLanguage,
  setCurrentLanguage,
  tr,
} from '../../src/lib/client/i18n-current.ts';

it('localizes known English messages and leaves unknown text unchanged', () => {
  expect(localizeMessage('zh-CN', 'Passwords must match exactly.')).toBe(
    zhCN['validation.passwordMatch'],
  );
  expect(localizeMessage('en', 'Passwords must match exactly.')).toBe(
    'Passwords must match exactly.',
  );
  expect(localizeMessage('zh-CN', 'Some server text nobody translated')).toBe(
    'Some server text nobody translated',
  );
});

it('keeps placeholder sets identical between every catalog key and its translation', () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, value] of Object.entries(zhCN))
    expect(placeholders(value), key).toEqual(
      placeholders(en[key as keyof typeof en]),
    );
});

it('tr() follows the language set by the page i18n instance', () => {
  const original = currentLanguage();
  // The setter only applies in the browser; simulate that environment here.
  (globalThis as { window?: unknown }).window = {};
  try {
    setCurrentLanguage('zh-CN');
    expect(tr('validation.timezone')).toBe(zhCN['validation.timezone']);
    setCurrentLanguage('en');
    expect(tr('validation.timezone')).toBe('Use a valid IANA timezone');
  } finally {
    setCurrentLanguage(original);
    delete (globalThis as { window?: unknown }).window;
  }
});
