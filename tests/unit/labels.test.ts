import { expect, it } from 'vitest';
import {
  LABEL_COLORS,
  LABEL_ICONS,
  LABEL_FONTS,
  MAX_LABELS,
  isLabelColor,
  isLabelFont,
  isLabelIcon,
  labelCommandSchema,
  labelNameKey,
  normalizeLabelName,
} from '../../src/lib/shared/labels.ts';

it('normalizes names (NFC, trim, collapse whitespace, 1-40 code points, no controls)', () => {
  expect(normalizeLabelName('  Work   Stuff  ')).toBe('Work Stuff');
  expect(normalizeLabelName('')).toBeNull();
  expect(normalizeLabelName('   ')).toBeNull();
  expect(normalizeLabelName('a'.repeat(40))).toBe('a'.repeat(40));
  expect(normalizeLabelName('a'.repeat(41))).toBeNull();
  expect(normalizeLabelName('bad\u0000name')).toBeNull();
  // Combining characters compose under NFC; count is of the composed form.
  expect(normalizeLabelName('e\u0301'.repeat(40))).toHaveLength(40);
});

it('case/width-insensitive identity key', () => {
  expect(labelNameKey('Work')).toBe(labelNameKey('work'));
  expect(labelNameKey('WORK')).toBe(labelNameKey(' work ')); // spacing/case
  expect(labelNameKey('ｗｏｒｋ')).toBe(labelNameKey('work')); // full-width
  expect(labelNameKey('Café')).not.toBe(labelNameKey('cafe'));
});

it('fixed palettes are exactly the documented sizes and recognized by the guards', () => {
  expect(LABEL_COLORS).toHaveLength(8);
  expect(LABEL_ICONS).toHaveLength(36);
  expect(LABEL_FONTS).toHaveLength(3);
  expect(isLabelColor('red')).toBe(true);
  expect(isLabelColor('scarlet')).toBe(false);
  expect(isLabelIcon('star')).toBe(true);
  expect(isLabelIcon('rocket')).toBe(true);
  expect(isLabelIcon('spaceship')).toBe(false);
  expect(isLabelFont('serif')).toBe(true);
  expect(isLabelFont('comic-sans')).toBe(false);
  expect(MAX_LABELS).toBe(40);
});

it('validates wire commands: known color/icon, confirmed delete, rejects unknown action/color/icon', () => {
  const mutationId = crypto.randomUUID();
  expect(
    labelCommandSchema.safeParse({
      action: 'create',
      mutationId,
      name: 'Work',
      color: 'blue',
      icon: null,
      headerColor: null,
      background: null,
      font: null,
    }).success,
  ).toBe(true);
  expect(
    labelCommandSchema.safeParse({
      action: 'create',
      mutationId,
      name: 'Work',
      color: 'blue',
      icon: 'star',
      headerColor: 'amber',
      background: 'gray',
      font: 'serif',
    }).success,
  ).toBe(true);
  expect(
    labelCommandSchema.safeParse({
      action: 'create',
      mutationId,
      name: 'Work',
      color: 'neon',
      icon: null,
      headerColor: null,
      background: null,
      font: null,
    }).success,
  ).toBe(false);
  expect(
    labelCommandSchema.safeParse({
      action: 'create',
      mutationId,
      name: 'Work',
      color: 'blue',
      icon: 'spaceship',
      headerColor: null,
      background: null,
      font: null,
    }).success,
  ).toBe(false);
  expect(
    labelCommandSchema.safeParse({
      action: 'create',
      mutationId,
      name: 'Work',
      color: 'blue',
      icon: null,
      headerColor: null,
      background: null,
      font: 'cursive',
    }).success,
  ).toBe(false);
  expect(
    labelCommandSchema.safeParse({
      action: 'delete',
      mutationId,
      labelId: crypto.randomUUID(),
      expectedRevision: 1,
      confirmed: true,
    }).success,
  ).toBe(true);
  expect(
    labelCommandSchema.safeParse({
      action: 'delete',
      mutationId,
      labelId: crypto.randomUUID(),
      expectedRevision: 1,
      confirmed: false,
    }).success,
  ).toBe(false);
});
