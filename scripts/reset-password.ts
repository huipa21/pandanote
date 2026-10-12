import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PrivateStorage,
  resolvePrivateRoot,
} from '../src/lib/server/storage/private-storage.ts';
import { Persistence } from '../src/lib/server/db/connection.ts';
import { AuthService } from '../src/lib/server/auth/service.ts';
import { passwordSchema } from '../src/lib/shared/auth.ts';
import {
  authPolicy,
  StartupConfigurationError,
} from '../src/lib/server/auth/policy.ts';
import { account } from '../src/lib/server/db/schema.ts';
import { readSecret } from '../src/lib/server/maintenance/terminal.ts';
import { DomainError } from '../src/lib/shared/domain.ts';

// No migration, startup cleanup/recovery, server ownership walk or web bypass.
// This command can open a second SQLite connection while the app serves requests.
let persistence: Persistence | undefined;
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  if (
    process.argv.length !== 2 ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  )
    throw new DomainError(
      'validation',
      'reset-password requires an interactive terminal and accepts no arguments or piped input.',
    );
  const { origin } = authPolicy(process.env);
  const root = resolvePrivateRoot();
  const journals = join(root, 'private/journals');
  if (
    existsSync(journals) &&
    readdirSync(journals).some((name) => name.endsWith('.json'))
  )
    throw new DomainError(
      'busy',
      'Restore recovery is pending. Restart PandaNote before resetting the password.',
    );
  if (!existsSync(join(root, 'db/pandanote.sqlite')))
    throw new DomainError(
      'conflict',
      `No account exists. Complete setup at ${origin}/setup`,
    );
  if (existsSync(join(root, 'private/pre-upgrade-state.json')))
    throw new DomainError(
      'busy',
      'Database upgrade recovery is pending. Restart PandaNote before resetting the password.',
    );
  const storage = new PrivateStorage();
  persistence = new Persistence(storage); // Refuses pending restore journals before DB access.
  const owner = persistence.db
    .select({ id: account.id, username: account.username })
    .from(account)
    .get();
  if (!owner)
    throw new DomainError(
      'conflict',
      `No account exists. Complete setup at ${origin}/setup`,
    );
  process.stdout.write(
    `Username: ${owner.username}\nThis resets the password, turns off MFA and signs out all devices.\n`,
  );
  // Do not hold DB/WAL handles while the operator thinks/types: a restore may
  // run during prompting. Reopen only after confirmation, and recheck identity.
  await persistence.close();
  persistence = undefined;
  let password = '';
  while (true) {
    password = await readSecret('New password: ', cancellation.signal);
    if (!passwordSchema.safeParse(password).success) {
      password = '';
      process.stdout.write(
        'Use 8–128 characters (at most 1024 UTF-8 bytes).\n',
      );
      continue;
    }
    const confirm = await readSecret(
      'Re-enter password: ',
      cancellation.signal,
    );
    if (password === confirm) break;
    password = '';
    process.stdout.write('Passwords do not match. Try again.\n');
  }
  persistence = new Persistence(storage);
  const current = persistence.db
    .select({ id: account.id, username: account.username })
    .from(account)
    .get();
  if (current?.id !== owner.id || current.username !== owner.username)
    throw new DomainError(
      'busy',
      'Account changed during prompting. Run reset-password again.',
    );
  await new AuthService(persistence).resetPassword(
    password,
    cancellation.signal,
  );
  password = '';
  process.stdout.write(
    `Password reset. MFA/recovery codes removed; all sessions revoked; sign-in limits cleared.\nSign in at ${origin}/login and enroll MFA again.\n`,
  );
} catch (error) {
  // Do not print native causes, paths, SQL or schema-validator input.
  console.error(
    error instanceof DomainError || error instanceof StartupConfigurationError
      ? error.message
      : 'Password reset refused. Check private storage, current schema and pending restore recovery; no reset was completed.',
  );
  process.exitCode = 1;
} finally {
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
  await persistence?.close();
}
