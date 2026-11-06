import { BadRequestException } from '@nestjs/common';
import {
  currentMonthString,
  dayKeyOf,
  dayToRange,
  lastNMonths,
  monthKeyOf,
  monthToRange,
  monthsBefore,
  shiftMonth,
  zonedTimeToUtc,
} from './month-range.util';

const SP = 'America/Sao_Paulo';
const iso = (d: Date) => d.toISOString();

describe('month-range.util', () => {
  describe('monthToRange', () => {
    // Brazil is UTC-3 (no DST since 2019), so a month starts at 03:00Z on the 1st.
    it.each([
      ['2026-01', '2026-01-01T03:00:00.000Z', '2026-02-01T03:00:00.000Z'],
      // The previous implementation returned 2026-03-04 here — March leaked into February.
      ['2026-02', '2026-02-01T03:00:00.000Z', '2026-03-01T03:00:00.000Z'],
      // ...and 2026-03-29 here — the last three days of March were dropped.
      ['2026-03', '2026-03-01T03:00:00.000Z', '2026-04-01T03:00:00.000Z'],
      // The reported bug: July ended on 2026-07-31, hiding everything paid on the 31st.
      ['2026-07', '2026-07-01T03:00:00.000Z', '2026-08-01T03:00:00.000Z'],
      // Year rollover.
      ['2026-12', '2026-12-01T03:00:00.000Z', '2027-01-01T03:00:00.000Z'],
      // Leap year: February must span 29 days.
      ['2028-02', '2028-02-01T03:00:00.000Z', '2028-03-01T03:00:00.000Z'],
    ])('%s spans [%s, %s)', (month, expectedStart, expectedEnd) => {
      const { startDate, endDate } = monthToRange(month);
      expect(iso(startDate)).toBe(expectedStart);
      expect(iso(endDate)).toBe(expectedEnd);
    });

    it('is contiguous with the next month, leaving no gap or overlap', () => {
      for (let m = 1; m <= 12; m++) {
        const key = `2026-${String(m).padStart(2, '0')}`;
        const nextKey = shiftMonth(key, 1);
        expect(iso(monthToRange(key).endDate)).toBe(
          iso(monthToRange(nextKey).startDate),
        );
      }
    });

    it('handles the DST transition that Brazil observed before 2019', () => {
      // DST ended 2019-02-16, so February 2019 opens at UTC-2 and closes at UTC-3.
      const { startDate, endDate } = monthToRange('2019-02');
      expect(iso(startDate)).toBe('2019-02-01T02:00:00.000Z');
      expect(iso(endDate)).toBe('2019-03-01T03:00:00.000Z');
    });

    it.each(['2026-13', '2026-00', 'lixo', '2026', '2026-1', '', null])(
      'rejects %p',
      (invalid) => {
        expect(() => monthToRange(invalid as string)).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('dayToRange', () => {
    it.each([
      ['2026-08-01', '2026-08-01T03:00:00.000Z', '2026-08-02T03:00:00.000Z'],
      // Month rollover: the 31st must roll into September 1st, not September 31st.
      ['2026-08-31', '2026-08-31T03:00:00.000Z', '2026-09-01T03:00:00.000Z'],
      // Year rollover.
      ['2026-12-31', '2026-12-31T03:00:00.000Z', '2027-01-01T03:00:00.000Z'],
      // Leap day.
      ['2028-02-29', '2028-02-29T03:00:00.000Z', '2028-03-01T03:00:00.000Z'],
    ])('%s spans [%s, %s)', (day, expectedStart, expectedEnd) => {
      const { startDate, endDate } = dayToRange(day);
      expect(iso(startDate)).toBe(expectedStart);
      expect(iso(endDate)).toBe(expectedEnd);
    });

    it('is contiguous with the next day, leaving no gap or overlap', () => {
      expect(iso(dayToRange('2026-08-01').endDate)).toBe(
        iso(dayToRange('2026-08-02').startDate),
      );
    });

    it.each([
      '2026-13-01',
      '2026-08-32',
      '2026-02-30',
      'lixo',
      '2026-08',
      '',
      null,
    ])('rejects %p', (invalid) => {
      expect(() => dayToRange(invalid as string)).toThrow(BadRequestException);
    });
  });

  describe('independence from the process timezone', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    // The old implementation mixed a UTC-constructed Date with local setMonth, so its
    // output changed with the ambient zone. Containers run UTC while dev machines run
    // Brasília, and both must agree.
    it.each(['UTC', 'America/Sao_Paulo', 'Asia/Tokyo', 'America/Los_Angeles'])(
      'produces identical ranges under TZ=%s',
      (tz) => {
        process.env.TZ = tz;
        const { startDate, endDate } = monthToRange('2026-07');
        expect(iso(startDate)).toBe('2026-07-01T03:00:00.000Z');
        expect(iso(endDate)).toBe('2026-08-01T03:00:00.000Z');
      },
    );
  });

  describe('zonedTimeToUtc', () => {
    it('resolves a wall-clock date in the given zone', () => {
      expect(iso(zonedTimeToUtc(2026, 7, 31, SP))).toBe(
        '2026-07-31T03:00:00.000Z',
      );
      expect(iso(zonedTimeToUtc(2026, 7, 31, 'UTC'))).toBe(
        '2026-07-31T00:00:00.000Z',
      );
      expect(iso(zonedTimeToUtc(2026, 7, 31, 'Asia/Tokyo'))).toBe(
        '2026-07-30T15:00:00.000Z',
      );
    });
  });

  describe('monthKeyOf / dayKeyOf', () => {
    it('buckets a late-evening payment into the local day and month', () => {
      // 2026-07-31 22:00 in Brasília — already August 1st in UTC.
      const lateOnLastDay = new Date('2026-08-01T01:00:00.000Z');
      expect(monthKeyOf(lateOnLastDay, SP)).toBe('2026-07');
      expect(dayKeyOf(lateOnLastDay, SP)).toBe('2026-07-31');
      // Same instant, UTC semantics — the behaviour we moved away from.
      expect(monthKeyOf(lateOnLastDay, 'UTC')).toBe('2026-08');
    });

    it('agrees with monthToRange on the boundary instants', () => {
      const { startDate, endDate } = monthToRange('2026-07');
      expect(monthKeyOf(startDate)).toBe('2026-07');
      expect(monthKeyOf(new Date(endDate.getTime() - 1))).toBe('2026-07');
      expect(monthKeyOf(endDate)).toBe('2026-08');
    });
  });

  describe('shiftMonth', () => {
    it.each([
      ['2026-07', 1, '2026-08'],
      ['2026-12', 1, '2027-01'],
      ['2026-01', -1, '2025-12'],
      ['2026-03', -14, '2025-01'],
      ['2026-07', 0, '2026-07'],
    ])('shifts %s by %i to %s', (month, delta, expected) => {
      expect(shiftMonth(month, delta)).toBe(expected);
    });

    it('rejects a malformed month', () => {
      expect(() => shiftMonth('2026-13', 1)).toThrow(BadRequestException);
    });
  });

  describe('monthsBefore', () => {
    it('returns the preceding months, most recent first, crossing the year', () => {
      expect(monthsBefore('2026-01', 3)).toEqual([
        '2025-12',
        '2025-11',
        '2025-10',
      ]);
    });

    it('returns an empty list for n = 0', () => {
      expect(monthsBefore('2026-07', 0)).toEqual([]);
    });
  });

  describe('currentMonthString / lastNMonths', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      jest.useRealTimers();
      process.env.TZ = originalTz;
    });

    it('reports the Brasília month at 22:00 on the last day, not the UTC one', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-01T01:00:00.000Z'));
      expect(currentMonthString()).toBe('2026-07');
    });

    it('ends on the current month and walks backwards, oldest first', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-10T12:00:00.000Z'));
      expect(lastNMonths(6)).toEqual([
        '2025-09',
        '2025-10',
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
      ]);
    });
  });
});
