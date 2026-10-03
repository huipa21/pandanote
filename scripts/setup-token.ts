import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import { Persistence } from '../src/lib/server/db/connection.ts';
import { AuthService } from '../src/lib/server/auth/service.ts';

// Deliberate operator-only display of the new token, never a server log event.
// Stop the app before this command; redirect stdout only to a protected terminal/file.
let persistence: Persistence | undefined;
try {
  persistence = new Persistence(new PrivateStorage());
  const token = new AuthService(persistence).issueSetupToken();
  console.error(
    'One-time token (valid one hour). Keep it secret; enter it at /setup. Reissuing invalidates the previous token.',
  );
  console.log(token);
} catch {
  console.error(
    'Could not issue setup token. Stop the app, migrate private storage, and check that no account exists.',
  );
  process.exitCode = 1;
} finally {
  await persistence?.close();
}
