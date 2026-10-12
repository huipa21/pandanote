import { expect, it } from 'vitest';
import {
  usernameSchema,
  emailSchema,
  passwordSchema,
  setupAccountSchema,
  setupPreferencesSchema,
} from '../../src/lib/shared/auth.ts';
import { setupAccess } from '../../src/lib/server/auth/setup-routing.ts';
import {
  browserLanguage,
  languages,
} from '../../src/lib/shared/i18n/registry.ts';
it('validates identity, exact 8–128 codepoint passwords and confirmation with strict boundaries', () => {
  expect(usernameSchema.parse('  My.User-1_ ')).toBe('my.user-1_');
  for (const username of ['ab', 'a'.repeat(33), '香港', 'a b', 'a@b'])
    expect(usernameSchema.safeParse(username).success).toBe(false);
  expect(emailSchema.parse(' Case@Example.invalid ')).toBe(
    'Case@Example.invalid',
  );
  for (const email of [
    '',
    'name',
    'a@b',
    'a@@b.c',
    'a@b..c',
    'a @b.c',
    'a'.repeat(245) + '@example.io',
  ])
    expect(emailSchema.safeParse(email).success).toBe(false);
  for (const value of [
    '12345678',
    ' 😊😊😊😊😊😊 ',
    'a'.repeat(128),
    '😊'.repeat(128),
  ])
    expect(passwordSchema.parse(value)).toBe(value);
  for (const value of ['1234567', 'a'.repeat(129), '😊'.repeat(129)])
    expect(passwordSchema.safeParse(value).success).toBe(false);
  const value = {
    username: 'owner',
    email: 'a@example.invalid',
    password: '12345678',
    passwordConfirm: '12345678',
    setupCode: 'ABCDE-FGHJK-MNPQR-STUVW',
  };
  expect(setupAccountSchema.safeParse(value).success).toBe(true);
  expect(
    setupAccountSchema.safeParse({ ...value, passwordConfirm: '12345678 ' })
      .success,
  ).toBe(false);
  expect(
    setupAccountSchema.safeParse({ ...value, token: 'obsolete' }).success,
  ).toBe(false);
});
it('validates setup preferences and uses exactly the language registry for browser defaults', () => {
  expect(languages.map((l) => l.code)).toEqual(['en', 'zh-CN']);
  expect(browserLanguage(['zh-CN', 'en'])).toBe('zh-CN');
  expect(browserLanguage(['zh-TW'])).toBe('en');
  const value = {
    siteTitle: ' <script>plain text</script> ',
    language: 'en',
    timezone: 'Asia/Tokyo',
  };
  expect(setupPreferencesSchema.parse(value).siteTitle).toBe(
    '<script>plain text</script>',
  );
  for (const patch of [
    { siteTitle: '' },
    { siteTitle: 'a'.repeat(61) },
    { siteTitle: 'a\u0000b' },
    { language: 'unknown' },
    { timezone: '+08:00' },
    { timezone: 'Invalid/Zone' },
    { weekStart: 0 },
  ])
    expect(
      setupPreferencesSchema.safeParse({ ...value, ...patch }).success,
    ).toBe(false);
});
it('covers every page routing cell for new, account and complete, signed in and out', () => {
  for (const path of [
    '/',
    '/notes/x',
    '/settings',
    '/login',
    '/setup',
    '/setup/preferences',
  ]) {
    for (const signedIn of [true, false])
      expect(setupAccess('new', signedIn, path, 'GET')).toEqual(
        path === '/setup' ? null : { redirect: '/setup' },
      );
    expect(setupAccess('account', false, path, 'GET')).toEqual(
      path === '/login' ? null : { redirect: '/login' },
    );
    expect(setupAccess('account', true, path, 'GET')).toEqual(
      path === '/setup/preferences' ? null : { redirect: '/setup/preferences' },
    );
  }
  for (const path of ['/setup', '/setup/preferences']) {
    expect(setupAccess('complete', false, path, 'GET')).toEqual({
      redirect: '/login',
    });
    expect(setupAccess('complete', true, path, 'GET')).toEqual({
      redirect: '/',
    });
  }
});
it('covers API/file setup gates without exposing private endpoints or blocking MFA/resume/logout', () => {
  for (const path of [
    '/api/notes',
    '/files/private',
    '/attachments/private',
    '/backups/private',
    '/api/settings/appearance',
  ])
    for (const method of ['GET', 'POST']) {
      expect(setupAccess('new', false, path, method)).toEqual({
        code: 'setup_required',
        status: 409,
      });
      expect(setupAccess('account', false, path, method)).toEqual({
        code: 'unauthorized',
        status: 401,
      });
      expect(setupAccess('account', true, path, method)).toEqual({
        code: 'setup_required',
        status: 409,
      });
      expect(setupAccess('complete', false, path, method)).toBeNull(); // normal auth gate follows
    }
  expect(setupAccess('new', false, '/api/setup/account', 'POST')).toBeNull();
  expect(setupAccess('account', false, '/api/setup/account', 'POST')).toEqual({
    code: 'already_set_up',
    status: 409,
  });
  for (const path of ['/api/auth/login', '/api/auth/mfa'])
    expect(setupAccess('account', false, path, 'POST')).toBeNull();
  for (const path of ['/api/setup/preferences', '/api/auth/logout'])
    expect(setupAccess('account', true, path, 'POST')).toBeNull();
  for (const path of ['/api/setup/account', '/api/setup/preferences'])
    expect(setupAccess('complete', true, path, 'POST')).toEqual({
      code: 'already_set_up',
      status: 409,
    });
});
