import { describe, expect, test } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import {
  readSettings,
  replaceSettings,
  updateAppearance,
} from '../../src/lib/server/settings/repository.ts';
import { appearanceFrom } from '../../src/lib/shared/appearance.ts';

describe('persisted appearance boundary', () => {
  test('updates only appearance, survives reopening, and leaves security/storage intact', async () => {
    await withPersistence(async (p) => {
      const original = readSettings(p);
      replaceSettings(p, {
        ...original,
        sessionLifetimeDays: 3,
        timezone: 'Asia/Hong_Kong',
        fileMaxBytes: 2048,
      });
      const appearance = {
        theme: 'dark',
        density: 'compact',
        collapseLongNotes: false,
      };
      expect(updateAppearance(p, appearance)).toEqual(appearance);
      expect(readSettings(p)).toEqual({
        ...original,
        sessionLifetimeDays: 3,
        timezone: 'Asia/Hong_Kong',
        fileMaxBytes: 2048,
        ...appearance,
      });
      // Real second DB connection, not an in-memory preference cache.
      const { Persistence } =
        await import('../../src/lib/server/db/connection.ts');
      const reopened = new Persistence(p.storage);
      try {
        expect(appearanceFrom(readSettings(reopened))).toEqual(appearance);
      } finally {
        await reopened.close();
      }
    });
  });
  test('rejects extra/sensitive keys, bad CSS-like values and maintenance writes without changing data', async () => {
    await withPersistence(async (p) => {
      const original = readSettings(p);
      for (const value of [
        null,
        {},
        {
          theme: 'dark',
          density: 'compact',
          collapseLongNotes: false,
          sessionLifetimeDays: 1,
        },
        {
          theme: 'dark" onclick="alert(1)',
          density: 'compact',
          collapseLongNotes: false,
        },
      ]) {
        expect(() => updateAppearance(p, value)).toThrow();
        expect(readSettings(p)).toEqual(original);
      }
      await p.coordinator.exclusive(async () => {
        expect(() => updateAppearance(p, appearanceFrom(original))).toThrow();
      });
      expect(readSettings(p)).toEqual(original);
    });
  });
});
