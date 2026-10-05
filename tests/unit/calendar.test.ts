import { describe, expect, it } from 'vitest';
import {
  calendarDate,
  calendarMonth,
  dayRange,
  monthRange,
  monthCells,
  shiftMonth,
  localDate,
  activityLevel,
  calendarPreferencesSchema,
} from '../../src/lib/shared/calendar.ts';
import {
  canonicalFilters,
  filterHref,
  parseTimelineQuery,
  toggleTag,
} from '../../src/lib/shared/timeline.ts';

describe('IANA calendar boundaries and canonical navigation', () => {
  it('uses correct leap/month/week grids for Monday and Sunday, including six-row months', () => {
    const cells = monthCells('2024-02', 1);
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(cells.filter(Boolean)).toHaveLength(29);
    expect(monthCells('2026-02', 0)[0]).toBe('2026-02-01');
    expect(monthCells('2026-03', 1)).toHaveLength(42);
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('computes 23/25-hour DST days and UTC month boundaries without host-local dates', () => {
    const spring = dayRange('2026-03-08', 'America/New_York');
    expect(spring).toEqual({
      start: Date.parse('2026-03-08T05:00Z'),
      end: Date.parse('2026-03-09T04:00Z'),
    });
    expect(
      dayRange('2026-11-01', 'America/New_York').end -
        dayRange('2026-11-01', 'America/New_York').start,
    ).toBe(25 * 3_600_000);
    expect(monthRange('2026-03', 'America/New_York')).toEqual({
      start: Date.parse('2026-03-01T05:00Z'),
      end: Date.parse('2026-04-01T04:00Z'),
    });
    expect(dayRange('2024-02-29', 'Asia/Hong_Kong').start).toBe(
      Date.parse('2024-02-28T16:00Z'),
    );
    expect(localDate(Date.parse('2025-12-31T15:30Z'), 'Asia/Tokyo')).toBe(
      '2026-01-01',
    );
    expect(localDate(Date.parse('2025-12-31T15:30Z'), 'UTC')).toBe(
      '2025-12-31',
    );
    expect(dayRange('2018-11-04', 'America/Sao_Paulo').start).toBe(
      Date.parse('2018-11-04T03:00Z'),
    ); // midnight skipped
  });
  it('validates named zones and rejects offset/path/invalid dates and duplicate/conflicting query controls', () => {
    for (const timezone of ['Asia/Hong_Kong', 'UTC', 'America/New_York'])
      expect(
        calendarPreferencesSchema.safeParse({ timezone, weekStart: 1 }).success,
      ).toBe(true);
    for (const timezone of ['+08:00', '../../UTC', 'Mars/Test'])
      expect(
        calendarPreferencesSchema.safeParse({ timezone, weekStart: 1 }).success,
      ).toBe(false);
    for (const value of [
      '2026-02-29',
      '2026-2-01',
      '1968-01-01',
      '10000-01-01',
    ])
      expect(() => calendarDate(value)).toThrow();
    expect(() => calendarMonth('2026-13')).toThrow();
    for (const query of [
      'date=',
      'month=',
      'date=2024-02-29&date=2024-02-28',
      'month=2024-02&date=2024-02-29',
      'date=2024-02-29&dayStart=1&dayEnd=2',
    ])
      expect(() => parseTimelineQuery(new URLSearchParams(query))).toThrow();
  });
  it('round-trips selected local days, month anchors and AND filters without implicitly carrying month to tag/search mode', () => {
    const filters = canonicalFilters(['Work'], '香港', undefined, '2024-02-29');
    expect(filterHref(filters)).toBe(
      '/?tag=work&q=%22%E9%A6%99%E6%B8%AF%22&date=2024-02-29',
    );
    expect(
      parseTimelineQuery(new URLSearchParams(filterHref(filters).slice(2)))
        .filters,
    ).toEqual(filters);
    expect(toggleTag({ tags: [], month: '2026-01' }, 'work')).toBe(
      '/?tag=work',
    );
    expect(filterHref({ tags: [], month: '2026-01' })).toBe('/?month=2026-01');
    expect([0, 1, 2, 3, 4, 7, 8, 100].map(activityLevel)).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});
