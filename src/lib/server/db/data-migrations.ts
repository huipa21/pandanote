import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { rebuildSearch } from '../search/index.ts';

export interface DataMigration {
  /** Stable identity: changing an applied step requires a NEW migration. */
  name: string;
  /** Synchronous, bounded, deterministic and database-only. No filesystem,
   * network or wall-clock access; use the runner's single fixed timestamp. */
  run: (db: Database.Database, ctx: { now: number }) => void;
}
export type DataMigrationRegistry = ReadonlyMap<number, DataMigration>;

// The baseline's custom SQL creates FTS5; normalized backfill is an ordinary
// registered step. Fresh DBs are empty; validated schema-v1 staging may have notes.
export const DATA_MIGRATIONS: DataMigrationRegistry = new Map([
  [
    2,
    {
      name: 'rebuild-search-v1',
      run: (db) => {
        rebuildSearch(drizzle(db));
      },
    },
  ],
]);
