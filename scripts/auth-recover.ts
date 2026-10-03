import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import { Persistence } from '../src/lib/server/db/connection.ts';
import { AuthService } from '../src/lib/server/auth/service.ts';
import { passwordSchema } from '../src/lib/shared/auth.ts';

// No web counterpart. Stop the app; run as the app UID with private DATA_DIR.
// Credentials arrive via bounded stdin, never argv/environment/log output.
let persistence: Persistence | undefined;
try {
  if (
    process.argv.slice(2).join(' ') !== '--confirm-reset-security' ||
    process.stdin.isTTY
  )
    throw new Error('Explicit confirmation and piped stdin required');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.from(chunk);
    bytes += value.length;
    if (bytes > 2048) throw new Error('Input too large');
    chunks.push(value);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    password?: unknown;
  };
  const password = passwordSchema.parse(input.password);
  persistence = new Persistence(new PrivateStorage());
  await new AuthService(persistence).operatorRecover(password);
  console.log(
    'Security reset: password changed, MFA/recovery codes removed, all sessions revoked. Restart the app and enroll MFA again.',
  );
} catch {
  console.error(
    'Recovery failed. Stop the app, check private DATA_DIR/schema/keys and supply a valid new password as stdin JSON with --confirm-reset-security.',
  );
  process.exitCode = 1;
} finally {
  await persistence?.close();
}
