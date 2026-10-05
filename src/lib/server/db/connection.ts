import { chmodSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { PrivateStorage } from '../storage/private-storage.ts';
import {
  WriteCoordinator,
  type MaintenanceLease,
} from '../maintenance/coordinator.ts';
import { JournalStore } from '../maintenance/journal.ts';
import { assertMigrationState } from './migrations.ts';
import * as schema from './schema.ts';

export type DomainDatabase = BetterSQLite3Database<typeof schema>;
export type DomainTransaction = Parameters<
  Parameters<DomainDatabase['transaction']>[0]
>[0];

// Low-level handle is for explicit migrations and test inspection only. Domain
// writes use Persistence.write; backups may use native.backup under exclusive.
export function connectDatabase(
  path: string,
  mustExist = false,
): Database.Database {
  const native = new Database(path, {
    fileMustExist: mustExist,
    timeout: 5000,
  });
  try {
    native.pragma('foreign_keys = ON');
    native.pragma('busy_timeout = 5000');
    if (native.pragma('journal_mode = WAL', { simple: true }) !== 'wal')
      throw new Error('SQLite WAL mode is required');
    native.pragma('synchronous = FULL');
    native.pragma('trusted_schema = OFF');
    if (process.platform !== 'win32') {
      for (const suffix of ['', '-wal', '-shm'])
        if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
    }
    return native;
  } catch (error) {
    native.close();
    throw error;
  }
}

export class Persistence {
  native: Database.Database;
  db: DomainDatabase;
  recoveryRequired = false;
  get available(): boolean {
    return this.native.open && !this.recoveryRequired;
  }
  readonly storage: PrivateStorage;
  readonly coordinator: WriteCoordinator;
  constructor(storage: PrivateStorage, coordinator = new WriteCoordinator()) {
    this.storage = storage;
    this.coordinator = coordinator;
    storage.readKeys(); // Fail closed on missing/corrupt portable key material.
    if (new JournalStore(storage, coordinator).list().length > 0)
      throw new Error(
        'Filesystem recovery is required before opening persistence',
      );
    this.native = connectDatabase(storage.databasePath, true);
    try {
      assertMigrationState(this.native);
    } catch (error) {
      this.native.close();
      throw error;
    }
    this.db = drizzle(this.native, { schema });
  }
  write<T>(
    operation: (tx: DomainTransaction) => T,
    lease?: MaintenanceLease,
  ): T {
    return (lease ?? this.coordinator).write(() =>
      this.db.transaction(
        (tx) => {
          const result = operation(tx);
          if (result instanceof Promise)
            throw new TypeError(
              'SQLite transaction callbacks must be synchronous',
            );
          return result;
        },
        { behavior: 'immediate' },
      ),
    );
  }
  /** Only the exclusive restore owner may close/reopen native handles. The
   * coordinator remains alive; existing domain services retain this instance. */
  closeForReplacement(lease: MaintenanceLease): void {
    lease.write(() => {
      const checkpoint = this.native.pragma('wal_checkpoint(TRUNCATE)') as {
        busy: number;
      }[];
      if (checkpoint.some((row) => row.busy !== 0))
        throw new Error('Database readers prevented a safe restore checkpoint');
      this.native.close();
    });
  }
  reopenAfterReplacement(lease: MaintenanceLease): void {
    lease.write(() => {
      this.storage.readKeys();
      const native = connectDatabase(this.storage.databasePath, true);
      try {
        assertMigrationState(native);
      } catch (error) {
        native.close();
        throw error;
      }
      this.native = native;
      this.db = drizzle(native, { schema });
    });
  }
  async close(): Promise<void> {
    await this.coordinator.shutdown(async () => {
      // Closing checkpoints WAL when this is the last connection. Do not force
      // a truncate checkpoint while another reader/online backup is active.
      if (this.native.open) this.native.close();
    });
  }
}
