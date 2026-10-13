import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import {
  storageLimitsFrom,
  storageLimitsSchema,
  cleanupUploadsSchema,
} from '../../src/lib/shared/storage.ts';

it('strictly bounds settings and activity-bound cleanup without path/config injection', () => {
  const limits = storageLimitsFrom(DEFAULT_SETTINGS);
  expect(storageLimitsSchema.parse(limits)).toEqual(limits);
  for (const patch of [
    { fileMaxBytes: 501 * 1024 ** 2 },
    { imageMaxPixels: 50_000_001 },
    { displayQuality: 0 },
    { thumbnailMaxEdge: 1025 },
    { dataDir: '/public' },
    { theme: 'dark' },
    { fileMaxBytes: Infinity },
  ])
    expect(storageLimitsSchema.safeParse({ ...limits, ...patch }).success).toBe(
      false,
    );
  const item = { id: crypto.randomUUID(), activityAt: 1 };
  expect(
    cleanupUploadsSchema.safeParse({ confirmed: true, batches: [item] })
      .success,
  ).toBe(true);
  for (const input of [
    { confirmed: false, batches: [item] },
    { confirmed: true, batches: [item, item] },
    { confirmed: true, batches: [{ ...item, id: '../files' }] },
  ])
    expect(cleanupUploadsSchema.safeParse(input).success).toBe(false);
});
