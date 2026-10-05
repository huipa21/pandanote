import { expect, it } from 'vitest';
import {
  manualLocation,
  locationCoordinates,
  locationMapUrl,
} from '../../src/lib/shared/location.ts';
import { locationSchema } from '../../src/lib/shared/domain.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import {
  storageLimitsFrom,
  storageLimitsSchema,
  cleanupUploadsSchema,
} from '../../src/lib/shared/storage.ts';
it('validates decimal locations, preserves zero/null accuracy and has a pure explicit OSM URL', () => {
  expect(manualLocation('0', '-180', '  香港  ')).toEqual({
    latitude: 0,
    longitude: -180,
    accuracy: null,
    label: '香港',
  });
  expect(manualLocation('90', '180', '', 0).accuracy).toBe(0);
  for (const [lat, lon] of [
    ['', '0'],
    ['91', '0'],
    ['0', '-181'],
    ['Infinity', '0'],
    ['0x10', '0'],
    ['NaN', '0'],
  ])
    expect(() => manualLocation(lat, lon, '')).toThrow();
  expect(() => manualLocation('0', '0', 'x'.repeat(201))).toThrow();
  expect(
    locationSchema.safeParse({
      latitude: 0,
      longitude: 0,
      accuracy: -1,
      label: null,
    }).success,
  ).toBe(false);
  const location = manualLocation('22.3', '114.1', '<script>');
  expect(locationCoordinates(location)).toBe('22.3, 114.1');
  expect(locationMapUrl(location)).toBe(
    'https://www.openstreetmap.org/?mlat=22.3&mlon=114.1#map=16/22.3/114.1',
  );
});
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
