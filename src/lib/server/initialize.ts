import {
  PrivateStorage,
  type StorageOptions,
} from './storage/private-storage.ts';
import { recoverRestores } from './backups/replacement.ts';
import { connectDatabase, Persistence } from './db/connection.ts';
import { upgradeDatabase, type UpgradeOptions } from './db/pre-upgrade.ts';
import { startupAppVersion } from './db/upgrade-version.ts';
import { DatabaseUpgradeError, type Migration } from './db/migrations.ts';
import { initializeSettings } from './settings/repository.ts';

/** Only safe startup errors cross the Kit/CLI logging boundary. Native errors can
 * contain SQL, filesystem paths or data; retain their cause for local diagnostics. */
export class ApplicationInitializationError extends Error {}
export interface InitializationOptions extends StorageOptions {
  /** Trusted test/tooling seams, never HTTP/environment-supplied SQL. */
  migrations?: Migration[];
  upgrade?: Partial<UpgradeOptions>;
}

/** Single-instance startup only. Requests never call this function. Recovery must
 * precede key reads and live migrations; current schemas do not create a copy. */
export async function initializeApplication(
  options: InitializationOptions = {},
): Promise<PrivateStorage> {
  try {
    const storage = new PrivateStorage(options);
    recoverRestores(storage);
    storage.initializeKeys();
    const native = connectDatabase(storage.databasePath);
    try {
      await upgradeDatabase(
        native,
        storage,
        {
          appVersion: startupAppVersion(),
          ...options.upgrade,
        },
        options.migrations,
      );
    } finally {
      native.close();
    }
    const persistence = new Persistence(storage);
    try {
      initializeSettings(persistence);
    } finally {
      await persistence.close();
    }
    return storage;
  } catch (error) {
    throw new ApplicationInitializationError(
      error instanceof DatabaseUpgradeError
        ? error.message
        : 'PandaNote initialization failed. Check private storage permissions, key material and restore recovery. No requests served.',
      { cause: error },
    );
  }
}

/** Values are deliberately never printed. Scrubbing also prevents duplication at
 * the container exec handoff and forwarding obsolete secrets to subprocesses. */
export function ignoreLegacyEnvironment(env: NodeJS.ProcessEnv): void {
  const present = ['SETUP_TOKEN', 'TRUSTED_PROXY_IPS'].some(
    (name) => env[name] !== undefined,
  );
  delete env.SETUP_TOKEN;
  delete env.TRUSTED_PROXY_IPS;
  if (present)
    console.info(
      'Legacy SETUP_TOKEN/TRUSTED_PROXY_IPS configuration is ignored; remove these variables.',
    );
}
