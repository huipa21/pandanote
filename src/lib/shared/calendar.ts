import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { DomainError } from './domain.ts';
import { settingsSchema } from './settings.ts';

export const calendarPreferencesSchema = settingsSchema.pick({
  timezone: true,
  weekStart: true,
});
export type CalendarPreferences = z.infer<typeof calendarPreferencesSchema>;
export interface MonthActivity extends CalendarPreferences {
  month: string;
  counts: number[];
  today: string;
}
// Bounded four-digit Gregorian dates make URLs/pickers unambiguous. Midnight is
// resolved by Temporal's start-of-day operation (including midnight DST changes).
export function calendarDate(value: string): Temporal.PlainDate {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error();
    const date = Temporal.PlainDate.from(value, { overflow: 'reject' });
    if (date.year < 1969 || date.year > 9998) throw new Error();
    return date;
  } catch {
    throw new DomainError(
      'validation',
      'Choose a valid calendar date between 1969 and 9998.',
    );
  }
}
export function calendarMonth(value: string): Temporal.PlainDate {
  if (!/^\d{4}-\d{2}$/.test(value))
    throw new DomainError('validation', 'Choose a valid year and month.');
  return calendarDate(`${value}-01`);
}
export function dayRange(date: string, timezone: string) {
  const start = calendarDate(date);
  return {
    start: start.toZonedDateTime(timezone).epochMilliseconds,
    end: start.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds,
  };
}
export function monthRange(month: string, timezone: string) {
  const start = calendarMonth(month);
  return {
    start: start.toZonedDateTime(timezone).epochMilliseconds,
    end: start.add({ months: 1 }).toZonedDateTime(timezone).epochMilliseconds,
  };
}
export function localDate(at: number, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}
export function shiftMonth(month: string, amount: number): string {
  const next = calendarMonth(month)
    .add({ months: amount })
    .toString()
    .slice(0, 7);
  calendarMonth(next);
  return next;
}
export function monthCells(month: string, weekStart: 0 | 1): (string | null)[] {
  const first = calendarMonth(month);
  const offset = (first.dayOfWeek - weekStart + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 0; day < first.daysInMonth; day++)
    cells.push(first.add({ days: day }).toString());
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function monthLabel(month: string): string {
  const date = calendarMonth(month);
  return new Date(Date.UTC(date.year, date.month - 1, 1)).toLocaleDateString(
    'en',
    { timeZone: 'UTC', month: 'long', year: 'numeric' },
  );
}
export function activityLevel(count: number): number {
  return count === 0
    ? 0
    : count === 1
      ? 1
      : count <= 3
        ? 2
        : count <= 7
          ? 3
          : 4;
}
