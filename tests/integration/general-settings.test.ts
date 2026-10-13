import { describe, expect, test } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { sessions } from '../../src/lib/server/db/schema.ts';
import {
  readSettings,
  replaceSettings,
  updateAppearance,
  updateGeneral,
} from '../../src/lib/server/settings/repository.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3_600_000,
    sessionHash = 'e'.repeat(64);
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        expiresAt,
        createdAt: Date.now(),
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    sessionHash,
    expiresAt,
    securityRevision: 1,
  };
}

describe('Settings → General persistence', () => {
  test('saves title and language independently without touching other settings; survives reopening', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      const original = readSettings(p);
      expect(original).toMatchObject({
        siteTitle: 'PandaNote',
        language: 'en',
      });
      replaceSettings(p, {
        ...original,
        timezone: 'Asia/Tokyo',
        sessionLifetimeDays: 3,
      });
      const general = {
        tagline: '',
        density: 'comfortable',
        collapseLongNotes: true,
      };
      expect(updateGeneral(p, identity, { language: 'zh-CN' })).toEqual({
        siteTitle: 'PandaNote',
        language: 'zh-CN',
        ...general,
      });
      expect(updateGeneral(p, identity, { siteTitle: '  我的笔记  ' })).toEqual(
        {
          siteTitle: '我的笔记',
          language: 'zh-CN',
          ...general,
        },
      );
      // Tagline and long-note collapse save with the same General request.
      expect(
        updateGeneral(p, identity, {
          tagline: '  慢慢写  ',
          collapseLongNotes: false,
        }),
      ).toEqual({
        siteTitle: '我的笔记',
        tagline: '慢慢写',
        language: 'zh-CN',
        density: 'comfortable',
        collapseLongNotes: false,
      });
      expect(updateGeneral(p, identity, { tagline: '' }).tagline).toBe('');
      // A later appearance write must not revert the general fields.
      updateAppearance(p, {
        theme: 'dark',
        density: 'compact',
        collapseLongNotes: false,
      });
      const expected = {
        ...original,
        timezone: 'Asia/Tokyo',
        sessionLifetimeDays: 3,
        siteTitle: '我的笔记',
        language: 'zh-CN',
        theme: 'dark',
        density: 'compact',
        collapseLongNotes: false,
      };
      expect(readSettings(p)).toEqual(expected);
      const { Persistence } =
        await import('../../src/lib/server/db/connection.ts');
      const reopened = new Persistence(p.storage);
      try {
        expect(readSettings(reopened)).toEqual(expected);
      } finally {
        await reopened.close();
      }
    });
  });
  test('General density and header-only preferences merge without clobbering each other', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      for (const density of ['compact', 'comfortable', 'spacious'] as const) {
        const saved = updateGeneral(p, identity, {
          density,
          siteTitle: 'My notebook',
          tagline: 'Keep writing',
        });
        expect(saved.density).toBe(density);
        updateAppearance(p, { theme: 'dark' }, identity);
        updateGeneral(p, identity, { language: 'zh-CN' });
        // The General form omits language/theme, so another title/density save keeps both.
        updateGeneral(p, identity, { siteTitle: 'Changed title', density });
        expect(readSettings(p)).toMatchObject({
          density,
          theme: 'dark',
          language: 'zh-CN',
          tagline: 'Keep writing',
        });
      }
      const { Persistence } =
        await import('../../src/lib/server/db/connection.ts');
      const reopened = new Persistence(p.storage);
      try {
        expect(readSettings(reopened).density).toBe('spacious');
      } finally {
        await reopened.close();
      }
    });
  });
  test('rejects unknown languages, bad titles and extra keys with no change; requires a live session', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      const before = readSettings(p);
      for (const value of [
        null,
        {},
        { language: 'fr' },
        { language: 'zh-TW' },
        { language: 'EN' },
        { siteTitle: '' },
        { siteTitle: '   ' },
        { siteTitle: 'x'.repeat(61) },
        { siteTitle: 'tab\there' },
        { siteTitle: 'ok', timezone: 'UTC' },
        { siteTitle: 'ok', setupCompletedAt: 1 },
        { tagline: 'x'.repeat(61) },
        { tagline: 'tab	here' },
        { collapseLongNotes: 'yes' },
        { density: 'huge' },
      ])
        expect(() => updateGeneral(p, identity, value)).toThrow();
      expect(readSettings(p)).toEqual(before);
      // 60 code points (not UTF-16 units) is accepted.
      expect(
        updateGeneral(p, identity, { siteTitle: '😀'.repeat(60) }).siteTitle,
      ).toHaveLength(120);
      replaceSettings(p, before);
      expect(() =>
        updateGeneral(
          p,
          { ...identity, sessionHash: 'f'.repeat(64) },
          { language: 'zh-CN' },
        ),
      ).toThrow();
      expect(readSettings(p)).toEqual(before);
    });
  });
});
