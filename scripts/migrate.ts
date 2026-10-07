import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import {
  connectDatabase,
  Persistence,
} from '../src/lib/server/db/connection.ts';
import { upgradeDatabase } from '../src/lib/server/db/pre-upgrade.ts';
import { startupAppVersion } from '../src/lib/server/db/upgrade-version.ts';
import { DatabaseUpgradeError } from '../src/lib/server/db/migrations.ts';
import { initializeSettings } from '../src/lib/server/settings/repository.ts';
import { JournalStore } from '../src/lib/server/maintenance/journal.ts';
import { WriteCoordinator } from '../src/lib/server/maintenance/coordinator.ts';

// Run as an operator before starting the single app instance. No accounts,
// sample notes or secrets are printed or seeded by this command.
try {
  const storage = new PrivateStorage();
  if (new JournalStore(storage, new WriteCoordinator()).list().length > 0)
    throw new Error('Filesystem recovery required');
  storage.initializeKeys();
  const native = connectDatabase(storage.databasePath);
  try {
    await upgradeDatabase(native, storage, { appVersion: startupAppVersion() });
  } finally {
    native.close();
  }
  const persistence = new Persistence(storage);
  try {
    initializeSettings(persistence);
  } finally {
    await persistence.close();
  }
  console.info(
    'Private storage, migrations and settings are ready. No account was created.',
  );
} catch (error) {
  if (error instanceof DatabaseUpgradeError) console.error(error.message);
  console.error(
    'Storage initialization failed. Check DATA_DIR, permissions, key material and trusted migration history. Stop the app before migrating.',
  );
  process.exitCode = 1;
}
