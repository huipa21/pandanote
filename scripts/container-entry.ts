import { authPolicy } from '../src/lib/server/auth/policy.ts';
import { bootstrapContainer } from './container-bootstrap.ts';
import { becomeContainerUser, containerIdentity } from './container-user.ts';

// Capture once, erase before recovery/initialization/subprocesses, and never log.
const setupToken = process.env.SETUP_TOKEN;
delete process.env.SETUP_TOKEN;
try {
  const command = process.argv.slice(2);
  if (command[0] !== 'node' || command.length < 2 || !process.execve)
    throw new Error('Unsupported container command');
  // Root preparation is confined to the image's private mount, never OS paths.
  if (process.env.DATA_DIR !== '/data')
    throw new Error('Container DATA_DIR must be /data');
  becomeContainerUser(containerIdentity(process.env));
  if (command.length === 2 && command[1] === 'build/index.js') {
    authPolicy(process.env);
    await bootstrapContainer(setupToken);
    console.info('PandaNote startup initialization complete.');
  }
  // Replace the initializer, not a child server: preserve PID/signals/shutdown.
  process.execve(
    process.execPath,
    [process.execPath, ...command.slice(1)],
    process.env,
  );
} catch {
  console.error(
    'PandaNote startup failed. Check DATA_DIR=/data, PUID/PGID, private data permissions, restore recovery, migration compatibility, and SETUP_TOKEN (43-character base64url, first setup only). No server started.',
  );
  process.exitCode = 1;
}
