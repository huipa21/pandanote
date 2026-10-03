import { expect, it } from 'vitest';
import { safeArchivePath } from '../spikes/archive';

it.each([
  '../escape',
  'files/../../escape',
  '/absolute',
  'C:/drive',
  'C:\\drive',
  '\\\\host\\share',
  'files\\..\\escape',
  './file',
  'files//image',
  'file\0hidden',
  'files/%2e%2e/file',
])('rejects unsafe or noncanonical path %j', (path) => {
  expect(safeArchivePath(path)).toBe(false);
});

it.each([
  'manifest.json',
  'snapshot/pandanote.sqlite',
  'files/00000000-0000-4000-8000-000000000000/display.webp',
])('accepts portable private-archive path %s', (path) => {
  expect(safeArchivePath(path)).toBe(true);
});
