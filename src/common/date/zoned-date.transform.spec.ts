import { parseZonedDateInput } from './zoned-date.transform';

const SP = 'America/Sao_Paulo';

describe('parseZonedDateInput', () => {
  it('converts a bare YYYY-MM-DD string to midnight in the timezone, expressed as UTC', () => {
    const result = parseZonedDateInput('2026-08-01', SP);
    expect(result.toISOString()).toBe('2026-08-01T03:00:00.000Z');
  });

  it('does not shift a full ISO timestamp', () => {
    const result = parseZonedDateInput('2026-08-01T14:32:00.000Z', SP);
    expect(result.toISOString()).toBe('2026-08-01T14:32:00.000Z');
  });

  it('passes an existing Date through unchanged', () => {
    const date = new Date('2026-08-01T00:00:00.000Z');
    const result = parseZonedDateInput(date, SP);
    expect(result.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('produces an invalid Date for a malformed string, leaving validation to @IsDate()', () => {
    const result = parseZonedDateInput('not-a-date', SP);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it('defaults to APP_TIMEZONE when no timezone is passed', () => {
    const result = parseZonedDateInput('2026-08-01');
    expect(result.toISOString()).toBe('2026-08-01T03:00:00.000Z');
  });
});
