import { expect, it } from 'vitest';
import { en } from '../../src/lib/shared/i18n/en.ts';
import { zhCN } from '../../src/lib/shared/i18n/zh-CN.ts';
import { errorText, localizeMessage } from '../../src/lib/shared/i18n/index.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';
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

it('carries a stable message key from the server and localizes it on the client', () => {
  const error = new DomainError('unauthorized', 'err.signInToContinue');
  expect(error.message).toBe('Sign in to continue.');
  const body = error.toApiError();
  expect(body).toEqual({
    code: 'unauthorized',
    message: 'Sign in to continue.',
    messageKey: 'err.signInToContinue',
  });
  expect(errorText('zh-CN', body)).toBe(zhCN['err.signInToContinue']);
  expect(errorText('zh-CN', body)).not.toBe(body.message);
  expect(errorText('en', body)).toBe('Sign in to continue.');
});

it('interpolates server error parameters in every language', () => {
  const error = new DomainError('validation', 'err.pinLimit', {
    params: { max: 7 },
  });
  expect(error.message).toBe('You can pin at most 7 notes. Unpin one first.');
  expect(errorText('zh-CN', error.toApiError())).toContain('7');
  expect(errorText('zh-CN', error.toApiError())).not.toContain('{max}');
});

it('falls back to exact-text lookup, then to the received text, without a key', () => {
  expect(errorText('zh-CN', { message: 'Passwords must match exactly.' })).toBe(
    zhCN['validation.passwordMatch'],
  );
  expect(errorText('zh-CN', { message: 'Some unknown text' })).toBe(
    'Some unknown text',
  );
  expect(
    new DomainError('busy', { text: 'operator text' }).toApiError(),
  ).toEqual({ code: 'busy', message: 'operator text' });
});

it('translates every server error key in zh-CN', () => {
  const keys = Object.keys(en).filter((key) => key.startsWith('err.'));
  expect(keys.length).toBeGreaterThan(150);
  for (const key of keys)
    expect(zhCN[key as keyof typeof en], key).toBeTruthy();
});
