import type { AuthService } from '../../src/lib/server/auth/service.ts';
/** Real credential creation and completion, not a seeded hash/auth bypass. */
export async function createFixtureAccount(
  auth: AuthService,
  password: string,
  ip: string,
) {
  const credential = await auth.createAccount(
    {
      username: 'fixture',
      email: 'fixture@example.invalid',
      password,
      passwordConfirm: password,
    },
    ip,
  );
  auth.finishSetup(auth.authenticate(credential.token)!, {
    siteTitle: 'PandaNote',
    language: 'en',
    timezone: 'UTC',
  });
  return credential;
}
