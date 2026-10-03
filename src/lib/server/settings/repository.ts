import { eq } from 'drizzle-orm';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type AppSettings,
} from '../../shared/settings.ts';
import type { Persistence } from '../db/connection.ts';
import { appSettings } from '../db/schema.ts';

export function readSettings(persistence: Persistence): AppSettings {
  const row = persistence.db
    .select()
    .from(appSettings)
    .where(eq(appSettings.singleton, 1))
    .get();
  if (!row)
    throw new Error('Settings are not initialized; run npm run db:migrate');
  return settingsSchema.parse(JSON.parse(row.valueJson));
}
export function initializeSettings(persistence: Persistence): void {
  persistence.write((tx) => {
    tx.insert(appSettings)
      .values({
        singleton: 1,
        valueJson: JSON.stringify(DEFAULT_SETTINGS),
        updatedAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  });
  readSettings(persistence); // Existing invalid settings are not silently replaced.
}
export function replaceSettings(
  persistence: Persistence,
  value: unknown,
): AppSettings {
  const settings = settingsSchema.parse(value);
  persistence.write((tx) => {
    if (
      tx
        .update(appSettings)
        .set({ valueJson: JSON.stringify(settings), updatedAt: Date.now() })
        .where(eq(appSettings.singleton, 1))
        .run().changes !== 1
    )
      throw new Error('Settings are not initialized');
  });
  return settings;
}
