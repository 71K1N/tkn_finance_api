import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';

describe('CreateTransactionDto', () => {
  const base = {
    amount: 10,
    account_id: '507f1f77bcf86cd799439011',
    type: 'EXPENSE',
  };

  function validate(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateTransactionDto, payload);
    return { dto, errors: validateSync(dto) };
  }

  it('rejects a client-supplied user_id, matching the global forbidNonWhitelisted pipe', () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...base,
      user_id: 1,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(
      errors.some((e) =>
        Object.keys(e.constraints || {}).includes(
          'whitelistValidation' as string,
        ),
      ),
    ).toBe(true);
  });

  it('accepts an empty string due_date, normalizing it to undefined', () => {
    const { dto, errors } = validate({ ...base, due_date: '' });

    expect(errors).toHaveLength(0);
    expect(dto.due_date).toBeUndefined();
  });

  it('accepts a missing due_date', () => {
    const { errors } = validate({ ...base });

    expect(errors).toHaveLength(0);
  });

  it('accepts a valid due_date', () => {
    const { dto, errors } = validate({ ...base, due_date: '2026-07-31' });

    expect(errors).toHaveLength(0);
    expect(dto.due_date).toBe('2026-07-31');
  });

  it('still rejects a malformed non-empty due_date', () => {
    const { errors } = validate({ ...base, due_date: 'not-a-date' });

    expect(errors.some((e) => e.property === 'due_date')).toBe(true);
  });

  it('converts a bare payment_date to midnight in APP_TIMEZONE, not UTC midnight', () => {
    const { dto, errors } = validate({ ...base, payment_date: '2026-08-01' });

    expect(errors).toHaveLength(0);
    expect(dto.payment_date?.toISOString()).toBe('2026-08-01T03:00:00.000Z');
  });

  it('leaves a full ISO payment_date timestamp unshifted', () => {
    const { dto, errors } = validate({
      ...base,
      payment_date: '2026-08-01T14:32:00.000Z',
    });

    expect(errors).toHaveLength(0);
    expect(dto.payment_date?.toISOString()).toBe('2026-08-01T14:32:00.000Z');
  });

  it('still rejects a malformed payment_date', () => {
    const { errors } = validate({ ...base, payment_date: 'not-a-date' });

    expect(errors.some((e) => e.property === 'payment_date')).toBe(true);
  });
});
