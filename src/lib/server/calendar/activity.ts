import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { readSettings } from '../settings/repository.ts';
import { notes } from '../db/schema.ts';
import {
  calendarDate,
  calendarMonth,
  dayRange,
  localDate,
  monthRange,
  type MonthActivity,
  type YearActivity,
} from '../../shared/calendar.ts';

export function yearActivity(
  p: Persistence,
  identity: SessionIdentity,
  year: number,
  now = Date.now(),
): YearActivity {
  calendarDate(`${year}-01-01`);
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const { timezone, weekStart } = readSettings(p);
    const yearStart = calendarDate(`${year}-01-01`).toZonedDateTime(
      timezone,
    ).epochMilliseconds;
    const yearEnd = calendarDate(`${year}-01-01`)
      .add({ years: 1 })
      .toZonedDateTime(timezone).epochMilliseconds;

    const columns: Record<string, ReturnType<typeof sql<number>>> = {};
    const monthMeta: { month: string; daysInMonth: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      const first = calendarMonth(monthStr);
      monthMeta.push({ month: monthStr, daysInMonth: first.daysInMonth });
      for (let d = 0; d < first.daysInMonth; d++) {
        const day = dayRange(first.add({ days: d }).toString(), timezone);
        columns[`m${m}_d${d}`] =
          sql<number>`coalesce(sum(case when ${notes.timelineAt} >= ${day.start} and ${notes.timelineAt} < ${day.end} then 1 else 0 end), 0)`;
      }
    }

    const row = tx
      .select(columns)
      .from(notes)
      .where(
        and(
          eq(notes.status, 'published'),
          gte(notes.timelineAt, yearStart),
          lt(notes.timelineAt, yearEnd),
        ),
      )
      .get()!;

    return {
      year,
      timezone,
      weekStart,
      today: localDate(now, timezone),
      months: monthMeta.map(({ month, daysInMonth }, idx) => {
        const m = idx + 1;
        return {
          month,
          counts: Array.from(
            { length: daysInMonth },
            (_, d) => row[`m${m}_d${d}`],
          ),
        };
      }),
    };
  });
}

export function monthActivity(
  p: Persistence,
  identity: SessionIdentity,
  month: string,
  now = Date.now(),
): MonthActivity {
  const first = calendarMonth(month);
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const { timezone, weekStart } = readSettings(p);
    const range = monthRange(month, timezone);
    // One indexed month scan, no Markdown/files leave the database.
    // Each interval is computed with IANA rules, never SQLite/VPS localtime.
    const columns: Record<string, ReturnType<typeof sql<number>>> = {};
    for (let i = 0; i < first.daysInMonth; i++) {
      const day = dayRange(first.add({ days: i }).toString(), timezone);
      columns[`d${i}`] =
        sql<number>`coalesce(sum(case when ${notes.timelineAt} >= ${day.start} and ${notes.timelineAt} < ${day.end} then 1 else 0 end), 0)`;
    }
    const row = tx
      .select(columns)
      .from(notes)
      .where(
        and(
          eq(notes.status, 'published'),
          gte(notes.timelineAt, range.start),
          lt(notes.timelineAt, range.end),
        ),
      )
      .get()!;
    return {
      month,
      timezone,
      weekStart,
      today: localDate(now, timezone),
      counts: Array.from({ length: first.daysInMonth }, (_, i) => row[`d${i}`]),
    };
  });
}
