import { expect, it } from 'vitest';
import {
  assertRevision,
  idSchema,
  locationSchema,
  noteMetadataSchema,
  transitionNote,
  validateTimelineAt,
} from '../../src/lib/shared/domain.ts';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
} from '../../src/lib/shared/settings.ts';

it('validates complete nullable location, finite ranges and bounded labels', () => {
  const good = {
    latitude: 22.3,
    longitude: 114.2,
    accuracy: null,
    label: null,
  };
  expect(locationSchema.parse(good)).toEqual(good);
  for (const bad of [
    { ...good, longitude: undefined },
    { ...good, latitude: null },
    { ...good, latitude: 90.1 },
    { ...good, longitude: -180.1 },
    { ...good, accuracy: -1 },
    { ...good, latitude: NaN },
    { ...good, accuracy: Infinity },
    { ...good, label: 'x'.repeat(201) },
    { ...good, path: '/tmp' },
  ])
    expect(locationSchema.safeParse(bad).success).toBe(false);
});
it('makes Trash prior state explicit and rejects impossible transitions', () => {
  const trashed = transitionNote('published', null, 'trash');
  expect(trashed).toEqual({ status: 'trash', priorStatus: 'published' });
  expect(
    transitionNote(trashed.status, trashed.priorStatus, 'restore'),
  ).toEqual({ status: 'published', priorStatus: null });
  expect(() => transitionNote('trash', null, 'restore')).toThrow();
  expect(() => transitionNote('published', null, 'restore')).toThrow();
});
it('uses UTC integer instants, explicit expected revisions and UUIDv4 IDs', () => {
  expect(validateTimelineAt(1_700_000_000_000, 1_700_000_000_001)).toBe(
    1_700_000_000_000,
  );
  for (const value of [-1, 0.5, '2020-01-01', Infinity, 1001])
    expect(() => validateTimelineAt(value, 1000)).toThrow();
  assertRevision(2, 2);
  expect(() => assertRevision(3, 2)).toThrow(/changed/);
  expect(() => assertRevision(1, 0)).toThrow();
  expect(idSchema.safeParse('../../file').success).toBe(false);
  const note = {
    id: 'e6dcb97f-a460-4140-b9e4-ac5753a103bf',
    status: 'published',
    priorStatus: null,
    timelineAt: 10,
    createdAt: 10,
    updatedAt: 10,
    contentEditedAt: null,
    pinnedAt: null,
    revision: 1,
    location: null,
  };
  expect(noteMetadataSchema.safeParse(note).success).toBe(true);
  expect(
    noteMetadataSchema.safeParse({ ...note, status: 'trash' }).success,
  ).toBe(false);
  expect(
    noteMetadataSchema.safeParse({ ...note, title: 'not supported' }).success,
  ).toBe(false);
  expect(noteMetadataSchema.safeParse({ ...note, pinnedAt: 10 }).success).toBe(
    true,
  );
  expect(
    noteMetadataSchema.safeParse({
      ...note,
      status: 'trash',
      priorStatus: 'published',
      pinnedAt: 10,
    }).success,
  ).toBe(false);
});
it('validates settings with safe bounded defaults, no path or origin settings', () => {
  expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  expect(DEFAULT_SETTINGS.sessionLifetimeDays).toBe(7);
  for (const timezone of ['Asia/Hong_Kong', 'Asia/Tokyo', 'America/New_York'])
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, timezone }).success,
    ).toBe(true);
  for (const bad of [
    { timezone: '../invalid' },
    { timezone: '+08:00' },
    { sessionLifetimeDays: 0 },
    { imageMaxPixels: 50_000_001 },
    { displayQuality: 101 },
    { schemaVersion: 2 },
    { dataDir: 'static' },
    { origin: 'https://attacker.invalid' },
  ])
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...bad }).success,
    ).toBe(false);
});
