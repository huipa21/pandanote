import {
  PrivateStorage,
  type StorageOptions,
} from '../src/lib/server/storage/private-storage.ts';
import { recoverRestores } from '../src/lib/server/backups/replacement.ts';
import {
  connectDatabase,
  Persistence,
} from '../src/lib/server/db/connection.ts';
import { applyMigrations } from '../src/lib/server/db/migrations.ts';
import { initializeSettings } from '../src/lib/server/settings/repository.ts';
import { AuthService } from '../src/lib/server/auth/service.ts';

/** Single-instance startup, before listening. Recovery must precede any key/DB reads. */
export async function bootstrapContainer(
  setupToken?: string,
  options: StorageOptions = {},
): Promise<void> {
  const storage = new PrivateStorage(options);
  recoverRestores(storage);
  storage.initializeKeys();
  const native = connectDatabase(storage.databasePath);
  try {
    applyMigrations(native);
  } finally {
    native.close();
  }
  const persistence = new Persistence(storage);
  try {
    initializeSettings(persistence);
    new AuthService(persistence).bootstrapSetupToken(setupToken);
  } finally {
    await persistence.close();
  }
}
