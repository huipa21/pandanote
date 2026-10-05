import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  appearanceFrom,
  appearanceHtml,
  appearanceSchema,
} from '../../src/lib/shared/appearance.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';

function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('appearance DTO is small/strict and the initial document has validated attributes, not a script', () => {
  expect(appearanceFrom(DEFAULT_SETTINGS)).toEqual({
    theme: 'system',
    density: 'comfortable',
    collapseLongNotes: true,
  });
  expect(
    appearanceSchema.safeParse({
      ...appearanceFrom(DEFAULT_SETTINGS),
      timezone: 'UTC',
    }).success,
  ).toBe(false);
  const html = appearanceHtml(readFileSync('src/app.html', 'utf8'), {
    theme: 'dark',
    density: 'compact',
    collapseLongNotes: false,
  });
  expect(html).toContain('data-theme="dark"');
  expect(html).toContain('data-density="compact"');
  expect(html).toContain('data-collapse="false"');
  expect(html).not.toContain('%pandanote.');
  expect(html).not.toContain('<script');
});

test('actual CSS palette passes AA text and interactive/focus contrast in both themes', () => {
  const css = readFileSync('src/lib/styles/tokens.css', 'utf8');
  for (const block of [
    css.split(':root {')[1].split('}')[0],
    css.split(":root[data-theme='dark'] {")[1].split('}')[0],
  ]) {
    const tokens = Object.fromEntries(
      [...block.matchAll(/--([a-z0-9-]+): (#[a-f0-9]{6});/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    for (const bg of ['page', 'surface']) {
      for (const fg of ['text', 'muted', 'accent', 'danger', 'warning'])
        expect(
          contrast(tokens[fg], tokens[bg]),
          `${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(tokens['control-border'], tokens[bg]),
      ).toBeGreaterThanOrEqual(3);
    }
    for (const heat of ['heat-1', 'heat-2'])
      expect(
        contrast(tokens.text, tokens[heat]),
        `calendar numeral on ${heat}`,
      ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tokens['on-accent'], tokens['heat-3']),
      'calendar numeral on heat-3',
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tokens.accent, tokens['accent-soft']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens['on-accent'], tokens.accent)).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});
