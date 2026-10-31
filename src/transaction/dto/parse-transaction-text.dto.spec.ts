import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ParseTransactionTextDto } from './parse-transaction-text.dto';

const errorsFor = async (plain: Record<string, unknown>) =>
  (await validate(plainToInstance(ParseTransactionTextDto, plain))).map(
    (error) => error.property,
  );

describe('ParseTransactionTextDto', () => {
  it('accepts a short sentence', async () => {
    expect(await errorsFor({ text: 'mercado 87,50 ontem' })).toEqual([]);
  });

  it('accepts exactly 200 characters', async () => {
    expect(await errorsFor({ text: 'a'.repeat(200) })).toEqual([]);
  });

  it('rejects a missing text', async () => {
    expect(await errorsFor({})).toEqual(['text']);
  });

  it('rejects empty and whitespace-only text', async () => {
    expect(await errorsFor({ text: '' })).toEqual(['text']);
    expect(await errorsFor({ text: '   ' })).toEqual(['text']);
  });

  it('rejects more than 200 characters', async () => {
    expect(await errorsFor({ text: 'a'.repeat(201) })).toEqual(['text']);
  });

  it('rejects non-string values', async () => {
    expect(await errorsFor({ text: 123 })).toEqual(['text']);
  });
});
