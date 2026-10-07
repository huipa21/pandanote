import {
  authPolicy,
  StartupConfigurationError,
} from '../src/lib/server/auth/policy.ts';
import {
  ignoreLegacyEnvironment,
  ApplicationInitializationError,
} from '../src/lib/server/initialize.ts';
import { bootstrapContainer } from './container-bootstrap.ts';
import {
  becomeContainerUser,
  containerIdentity,
  containerCommand,
} from './container-user.ts';

try {
  ignoreLegacyEnvironment(process.env);
  // The image's private mount is authoritative, regardless of env_file DATA_DIR.
  process.env.DATA_DIR = '/data';
  const command = containerCommand(process.argv.slice(2));
  const tool = command === 'server' ? undefined : command;
  if (!process.execve) throw new Error('Container exec handoff unavailable');
  // Tools do not walk/chown a running app's tree. They verify the mount owner,
  // then drop permanently to the configured identity before opening any files.
  becomeContainerUser(containerIdentity(process.env), {}, Boolean(tool));
  if (!tool) {
    authPolicy(process.env);
    await bootstrapContainer();
    console.info('PandaNote startup initialization complete.');
  }
  // Replace the initializer, preserving PID 1/signals and adapter shutdown.
  process.execve(
    process.execPath,
    [process.execPath, tool ? `scripts/${tool}.ts` : 'build/index.js'],
    process.env,
  );
} catch (error) {
  // All called startup routines expose safe messages; never print native causes.
  const message =
    error instanceof ApplicationInitializationError ||
    error instanceof StartupConfigurationError
      ? error.message
      : 'PandaNote startup failed. Check ORIGIN, PUID/PGID, private data ownership and the supported command. No server started.';
  console.error(message);
  process.exitCode = 1;
}
