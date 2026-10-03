import { PrivateStorage } from './storage/private-storage.ts';
import { Persistence } from './db/connection.ts';
import { readSettings } from './settings/repository.ts';
import { AuthService } from './auth/service.ts';
import { authPolicy, type AuthPolicy } from './auth/policy.ts';

export interface Runtime {
  persistence: Persistence;
  auth: AuthService;
  policy: AuthPolicy;
  close: () => Promise<void>;
}
let current: Runtime | undefined;
// Lazy so builds and public liveness require no database. No migrations or
// account/key creation in requests. Failed initialization returns safe 503.
export function getRuntime(): Runtime {
  if (current) return current;
  const policy = authPolicy(process.env);
  const persistence = new Persistence(new PrivateStorage());
  try {
    readSettings(persistence);
    const auth = new AuthService(persistence);
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => (closing ??= persistence.close());
    current = { persistence, auth, policy, close };
    const onShutdown = (): void => {
      void close().catch(() => {
        console.error(
          'Private persistence shutdown failed. Operator inspection required.',
        );
        process.exitCode = 1;
      });
    };
    // Adapter 6 emits this only after HTTP requests drain. beforeExit covers
    // development/tools without installing competing SIGTERM/SIGINT handlers.
    process.once('sveltekit:shutdown', onShutdown);
    process.once('beforeExit', onShutdown);
    return current;
  } catch (error) {
    void persistence.close();
    throw error;
  }
}
