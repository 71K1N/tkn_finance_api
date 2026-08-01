import { BadRequestException } from '@nestjs/common';

/**
 * The timezone that defines what a "month" means for this application.
 *
 * Every aggregation keyed by month (dashboard summary, category breakdown,
 * planned-vs-unplanned, budget `spent`) must agree on where a month starts and ends.
 * Anchoring that to a fixed zone — rather than to the process's ambient timezone —
 * keeps results identical whether the API runs on a developer machine in Brasília or
 * in a container that defaults to UTC.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * How far ahead of UTC `timeZone` is at a given instant, in milliseconds.
 * Derived from Intl rather than hardcoded so DST transitions (Brazil observed DST
 * until 2019) and non-Brazilian zones stay correct.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  // Intl only gives whole seconds; keep the sub-second part of the original instant
  // out of the offset so the result is a clean zone offset.
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which the given wall-clock time occurs in `timeZone`.
 *
 * Two passes: the first offset is estimated from the naive UTC interpretation, then
 * re-checked against the candidate result. They differ only when the estimate lands on
 * the other side of a DST transition, in which case the second offset is the right one.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string = APP_TIMEZONE,
): Date {
  const naive = Date.UTC(year, month - 1, day);
  const firstPass = tzOffsetMs(new Date(naive), timeZone);
  const candidate = new Date(naive - firstPass);
  const secondPass = tzOffsetMs(candidate, timeZone);
  return secondPass === firstPass ? candidate : new Date(naive - secondPass);
}

/**
 * Half-open UTC range `[startDate, endDate)` covering the calendar month in
 * {@link APP_TIMEZONE}. Use with Mongo as `{ $gte: startDate, $lt: endDate }`.
 *
 * Also the validation point for the `month` query param — several endpoints accept it
 * without a DTO, and an unvalidated string would otherwise reach Mongo as `Invalid Date`.
 */
export function monthToRange(month: string): {
  startDate: Date;
  endDate: Date;
} {
  if (!MONTH_PATTERN.test(month ?? '')) {
    throw new BadRequestException(
      `Invalid month "${month}". Expected format YYYY-MM.`,
    );
  }

  const [year, monthNum] = month.split('-').map(Number);
  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;

  return {
    startDate: zonedTimeToUtc(year, monthNum, 1),
    endDate: zonedTimeToUtc(nextYear, nextMonth, 1),
  };
}

/**
 * Half-open UTC range `[startDate, endDate)` covering the calendar day `dateStr`
 * (`YYYY-MM-DD`) in {@link APP_TIMEZONE}. Use with Mongo as `{ $gte: startDate, $lt: endDate }`.
 */
export function dayToRange(
  dateStr: string,
  timeZone: string = APP_TIMEZONE,
): { startDate: Date; endDate: Date } {
  if (!DATE_PATTERN.test(dateStr ?? '')) {
    throw new BadRequestException(
      `Invalid date "${dateStr}". Expected format YYYY-MM-DD.`,
    );
  }

  const [year, month, day] = dateStr.split('-').map(Number);

  // The pattern bounds day to 01-31 but can't know per-month length (e.g. Feb 30) -
  // Date.UTC silently normalizes an overflowing day into the next month, so comparing
  // the round-tripped parts back against the input catches it.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    throw new BadRequestException(
      `Invalid date "${dateStr}": day does not exist in that month.`,
    );
  }

  const startDate = zonedTimeToUtc(year, month, day, timeZone);

  // Date.UTC normalizes an out-of-range day (e.g. day 32) into the following month,
  // so this is a safe way to get "the next calendar day" without hand-rolling
  // month-length/leap-year arithmetic.
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const endDate = zonedTimeToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timeZone,
  );

  return { startDate, endDate };
}

/** Formats an instant as the wall-clock date parts in `timeZone`. */
function zonedParts(
  date: Date,
  timeZone: string,
): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value as string;

  return { year: get('year'), month: get('month'), day: get('day') };
}

/** `YYYY-MM` of the month that contains `date` in {@link APP_TIMEZONE}. */
export function monthKeyOf(
  date: Date,
  timeZone: string = APP_TIMEZONE,
): string {
  const { year, month } = zonedParts(date, timeZone);
  return `${year}-${month}`;
}

/** `YYYY-MM-DD` of `date` in {@link APP_TIMEZONE}. */
export function dayKeyOf(date: Date, timeZone: string = APP_TIMEZONE): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM` of the current month in {@link APP_TIMEZONE}. */
export function currentMonthString(): string {
  return monthKeyOf(new Date());
}

/** `YYYY-MM-DD` of today in {@link APP_TIMEZONE}. */
export function todayString(): string {
  return dayKeyOf(new Date());
}

/**
 * Shifts a `YYYY-MM` key by `delta` months. Pure integer arithmetic — deliberately
 * avoids `Date`, whose `setMonth`/`new Date(y, m, 1)` are relative to the process
 * timezone and overflow on differing month lengths.
 */
export function shiftMonth(month: string, delta: number): string {
  if (!MONTH_PATTERN.test(month ?? '')) {
    throw new BadRequestException(
      `Invalid month "${month}". Expected format YYYY-MM.`,
    );
  }
  const [year, monthNum] = month.split('-').map(Number);
  const zeroBased = year * 12 + (monthNum - 1) + delta;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = (((zeroBased % 12) + 12) % 12) + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
}

/** The `n` months immediately before `month`, most recent first. */
export function monthsBefore(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, -(i + 1)));
}

/** The last `n` months up to and including the current one, oldest first. */
export function lastNMonths(n: number): string[] {
  const current = currentMonthString();
  return Array.from({ length: n }, (_, i) => shiftMonth(current, -(n - 1 - i)));
}
