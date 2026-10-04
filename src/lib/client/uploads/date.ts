import { Temporal } from '@js-temporal/polyfill';
export function timelineInput(instant: number, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}
export function timelineInstant(
  value: string,
  timezone: string,
  now = Date.now(),
): number {
  const instant = Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, {
    disambiguation: 'reject',
  }).epochMilliseconds;
  if (instant > now) throw new Error('Timeline date must be now or earlier.');
  return instant;
}
