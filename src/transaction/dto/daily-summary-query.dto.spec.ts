import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DailySummaryQueryDto } from './daily-summary-query.dto';

const errorsFor = async (plain: Record<string, unknown>) =>
  (await validate(plainToInstance(DailySummaryQueryDto, plain))).map(
    (error) => error.property,
  );

describe('DailySummaryQueryDto', () => {
  it('accepts from and to as YYYY-MM-DD', async () => {
    expect(await errorsFor({ from: '2026-01-01', to: '2026-12-31' })).toEqual(
      [],
    );
  });

  it('rejects a missing to', async () => {
    expect(await errorsFor({ from: '2026-01-01' })).toEqual(['to']);
  });

  it('rejects a missing from', async () => {
    expect(await errorsFor({ to: '2026-01-01' })).toEqual(['from']);
  });

  it('rejects timestamps and other formats', async () => {
    expect(
      await errorsFor({ from: '2026-01-01T00:00:00Z', to: '01/02/2026' }),
    ).toEqual(['from', 'to']);
  });
});
