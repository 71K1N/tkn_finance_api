import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DueQueryDto } from './due-query.dto';

const check = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(DueQueryDto, plain);
  const errors = await validate(dto);
  return { dto, errors: errors.map((e) => e.property) };
};

describe('DueQueryDto', () => {
  it('defaults days to 7', async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual([]);
    expect(dto.days).toBe(7);
  });

  it('accepts days as a numeric query string within 1..90', async () => {
    for (const days of ['1', '30', '90']) {
      const { dto, errors } = await check({ days });
      expect(errors).toEqual([]);
      expect(dto.days).toBe(Number(days));
    }
  });

  it.each(['0', '91', '-3', '1.5', 'abc'])('rejects days=%s', async (days) => {
    expect((await check({ days })).errors).toEqual(['days']);
  });
});
