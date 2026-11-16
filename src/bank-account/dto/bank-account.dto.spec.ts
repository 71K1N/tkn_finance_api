import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBankAccountDto } from './create-bank-account.dto';
import { UpdateBankAccountDto } from './update-bank-account.dto';

describe('bank account DTO type validation', () => {
  it.each([CreateBankAccountDto, UpdateBankAccountDto])(
    '%p rejects an unknown type',
    async (Dto) => {
      const dto = plainToInstance(Dto as any, {
        description: 'x',
        type: 'SAVINGS',
      });
      const errors = await validate(dto as object);
      expect(errors.map((e) => e.property)).toContain('type');
    },
  );

  it('accepts INVESTMENT and a missing type', async () => {
    for (const body of [
      { description: 'x', type: 'INVESTMENT' },
      { description: 'x' },
    ]) {
      const dto = plainToInstance(CreateBankAccountDto, body);
      await expect(validate(dto)).resolves.toHaveLength(0);
    }
  });
});
