import { eq } from 'drizzle-orm';
import {
  calendarPreferencesSchema,
  type CalendarPreferences,
} from '../../shared/calendar.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import type { SessionIdentity } from '../auth/service.ts';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type AppSettings,
} from '../../shared/settings.ts';
import type { Persistence } from '../db/connection.ts';
import { appSettings } from '../db/schema.ts';
import { DomainError } from '../../shared/domain.ts';
import {
  appearanceSchema,
  appearanceFrom,
  type Appearance,
} from '../../shared/appearance.ts';

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
// Merge inside the write transaction so appearance never overwrites concurrent
// security/storage settings with a stale whole-settings snapshot.
export function updateAppearance(
  persistence: Persistence,
  value: unknown,
): Appearance {
  const parsed = appearanceSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError('validation', 'Choose valid appearance settings.');
  return persistence.write((tx) => {
    const row = tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.singleton, 1))
      .get();
    if (!row) throw new Error('Settings are not initialized');
    const settings = settingsSchema.parse({
      ...settingsSchema.parse(JSON.parse(row.valueJson)),
      ...parsed.data,
    });
    tx.update(appSettings)
      .set({ valueJson: JSON.stringify(settings), updatedAt: Date.now() })
      .where(eq(appSettings.singleton, 1))
      .run();
    return appearanceFrom(settings);
  });
}
export function updateCalendar(
  p: Persistence,
  identity: SessionIdentity,
  value: unknown,
): CalendarPreferences {
  const parsed = calendarPreferencesSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError(
      'validation',
      'Choose a valid IANA timezone and week start.',
    );
  return p.write((tx) => {
    assertSessionIdentity(tx, identity);
    const row = tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.singleton, 1))
      .get();
    if (!row) throw new Error('Settings are not initialized');
    const settings = settingsSchema.parse({
      ...settingsSchema.parse(JSON.parse(row.valueJson)),
      ...parsed.data,
    });
    tx.update(appSettings)
      .set({ valueJson: JSON.stringify(settings), updatedAt: Date.now() })
      .where(eq(appSettings.singleton, 1))
      .run();
    return { timezone: settings.timezone, weekStart: settings.weekStart };
  });
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
