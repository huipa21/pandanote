import { eq } from 'drizzle-orm';
import {
  storageLimitsSchema,
  storageLimitsFrom,
  type StorageLimits,
} from '../../shared/storage.ts';
import {
  calendarPreferencesSchema,
  type CalendarPreferences,
} from '../../shared/calendar.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import type { SessionIdentity } from '../auth/service.ts';
import {
  DEFAULT_SETTINGS,
  generalSettingsSchema,
  settingsSchema,
  type AppSettings,
} from '../../shared/settings.ts';
import type { Language } from '../../shared/i18n/registry.ts';
import type { Persistence } from '../db/connection.ts';
import { appSettings } from '../db/schema.ts';
import { DomainError } from '../../shared/domain.ts';
import {
  appearanceUpdateSchema,
  appearanceFrom,
  type Appearance,
} from '../../shared/appearance.ts';

export function readSettings(persistence: Persistence): AppSettings {
  const row = persistence.db
    .select()
    .from(appSettings)
    .where(eq(appSettings.singleton, 1))
    .get();
  if (!row) throw new Error('Settings are not initialized; restart PandaNote.');
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
  identity?: SessionIdentity,
): Appearance {
  const parsed = appearanceUpdateSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError('validation', 'err.chooseValidAppearanceSettings');
  return persistence.write((tx) => {
    if (identity) assertSessionIdentity(tx, identity);
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
export function updateGeneral(
  p: Persistence,
  identity: SessionIdentity,
  value: unknown,
): {
  siteTitle: string;
  tagline: string;
  language: Language;
  density: AppSettings['density'];
  collapseLongNotes: boolean;
} {
  const parsed = generalSettingsSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError('validation', 'err.chooseASiteTitleOf');
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
    return {
      siteTitle: settings.siteTitle,
      tagline: settings.tagline,
      language: settings.language,
      density: settings.density,
      collapseLongNotes: settings.collapseLongNotes,
    };
  });
}
export function updateCalendar(
  p: Persistence,
  identity: SessionIdentity,
  value: unknown,
): CalendarPreferences {
  const parsed = calendarPreferencesSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError('validation', 'err.chooseAValidIanaTimezone');
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
export function updateStorageLimits(
  p: Persistence,
  identity: SessionIdentity,
  value: unknown,
): StorageLimits {
  const parsed = storageLimitsSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError('validation', 'err.chooseValidUploadImageAnd');
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
    return storageLimitsFrom(settings);
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
