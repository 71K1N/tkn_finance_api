import { Transform } from 'class-transformer';
import { APP_TIMEZONE, zonedTimeToUtc } from './month-range.util';

const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a `payment_date`-style input into the UTC instant it represents.
 *
 * A bare `YYYY-MM-DD` string is a calendar day picked in {@link APP_TIMEZONE}
 * (e.g. from a date picker), not an instant — `new Date("2026-08-01")` parses it as
 * UTC midnight, which is 3 hours before Brasília midnight and renders as the previous
 * day once converted back to local time. Those are routed through `zonedTimeToUtc`
 * instead. Anything else (a full ISO timestamp, an existing `Date`) is a real instant
 * already and is left to the native `Date` constructor.
 */
export function parseZonedDateInput(
  value: unknown,
  timeZone: string = APP_TIMEZONE,
): Date {
  if (typeof value === 'string' && BARE_DATE_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return zonedTimeToUtc(year, month, day, timeZone);
  }
  return new Date(value as string | number | Date);
}

/** Class-transformer decorator applying {@link parseZonedDateInput} to the field. */
export function ToZonedDate(): PropertyDecorator {
  return Transform(({ value }) =>
    value === undefined || value === null ? value : parseZonedDateInput(value),
  ) as PropertyDecorator;
}
