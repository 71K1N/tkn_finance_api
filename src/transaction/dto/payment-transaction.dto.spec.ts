import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaymentTransactionDto } from './payment-transaction.dto';

describe('PaymentTransactionDto', () => {
  function validate(payload: Record<string, unknown>) {
    const dto = plainToInstance(PaymentTransactionDto, payload);
    return { dto, errors: validateSync(dto) };
  }

  it('converts a bare payment_date to midnight in APP_TIMEZONE, not UTC midnight', () => {
    const { dto, errors } = validate({
      paid_amount: 10,
      payment_date: '2026-08-01',
    });

    expect(errors).toHaveLength(0);
    expect(dto.payment_date?.toISOString()).toBe('2026-08-01T03:00:00.000Z');
  });

  it('leaves a full ISO payment_date timestamp unshifted', () => {
    const { dto, errors } = validate({
      paid_amount: 10,
      payment_date: '2026-08-01T14:32:00.000Z',
    });

    expect(errors).toHaveLength(0);
    expect(dto.payment_date?.toISOString()).toBe('2026-08-01T14:32:00.000Z');
  });

  it('accepts a missing payment_date', () => {
    const { errors } = validate({ paid_amount: 10 });

    expect(errors).toHaveLength(0);
  });

  it('still rejects a malformed payment_date', () => {
    const { errors } = validate({
      paid_amount: 10,
      payment_date: 'not-a-date',
    });

    expect(errors.some((e) => e.property === 'payment_date')).toBe(true);
  });
});
