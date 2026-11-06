import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { TransactionParserService } from './transaction-parser.service';
import { Transaction } from './entities/transaction.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';

const mockCreate = jest.fn();
jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const USER_ID = 7;
const oid = (hex: string) => ObjectId.createFromHexString(hex);
const CATEGORY_ID = oid('aaaaaaaaaaaaaaaaaaaaaaaa');
const TRANSPORTE = oid('bbbbbbbbbbbbbbbbbbbbbbb1');
const SUPERMERCADO = oid('bbbbbbbbbbbbbbbbbbbbbbb2');
const NUBANK = oid('cccccccccccccccccccccccc');
const INTER = oid('dddddddddddddddddddddddd');

const groqAnswers = (content: string) =>
  mockCreate.mockResolvedValue({ choices: [{ message: { content } }] });

describe('TransactionParserService', () => {
  let transactionRepo: { findOne: jest.Mock };
  let subcategoryRepo: { find: jest.Mock };
  let categoryRepo: { find: jest.Mock };

  async function build(): Promise<TransactionParserService> {
    const module = await Test.createTestingModule({
      providers: [
        TransactionParserService,
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: getRepositoryToken(Subcategory), useValue: subcategoryRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
      ],
    }).compile();
    return module.get(TransactionParserService);
  }

  /** `findOne` answers by shape: history lookups carry a `name`, the default-account one doesn't. */
  const stubTransactions = (opts: {
    history?: Partial<Transaction> | null;
    latest?: Partial<Transaction> | null;
  }) =>
    transactionRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.name !== undefined ? opts.history ?? null : opts.latest ?? null,
      ),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GROQ_API_KEY = 'test-key';
    transactionRepo = { findOne: jest.fn() };
    subcategoryRepo = {
      find: jest.fn().mockResolvedValue([
        { id: TRANSPORTE, name: 'Transporte', categoryId: CATEGORY_ID },
        { id: SUPERMERCADO, name: 'Supermercado', categoryId: CATEGORY_ID },
      ]),
    };
    categoryRepo = {
      find: jest.fn().mockResolvedValue([{ id: CATEGORY_ID, name: 'Gastos' }]),
    };
  });

  afterAll(() => {
    delete process.env.GROQ_API_KEY;
  });

  it('uses the history without calling Groq', async () => {
    stubTransactions({
      history: { subcategory_id: SUPERMERCADO, account_id: NUBANK },
    });
    const service = await build();

    const draft = await service.parse(USER_ID, 'mercado 40');

    expect(draft).toMatchObject({
      name: 'Mercado',
      amount: 40,
      subcategory_id: SUPERMERCADO.toString(),
      account_id: NUBANK.toString(),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('on a history miss asks Groq and defaults to the latest account', async () => {
    stubTransactions({ latest: { account_id: INTER } });
    groqAnswers(JSON.stringify({ subcategory_id: TRANSPORTE.toString() }));
    const service = await build();

    const draft = await service.parse(USER_ID, 'uber 30');

    expect(draft.subcategory_id).toBe(TRANSPORTE.toString());
    expect(draft.account_id).toBe(INTER.toString());
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const [request, options] = mockCreate.mock.calls[0];
    expect(request).toMatchObject({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    expect(JSON.parse(request.messages[1].content).subcategories).toEqual([
      { id: TRANSPORTE.toString(), name: 'Transporte', category: 'Gastos' },
      { id: SUPERMERCADO.toString(), name: 'Supermercado', category: 'Gastos' },
    ]);
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('discards an id that is not in the list', async () => {
    stubTransactions({ latest: { account_id: INTER } });
    groqAnswers(JSON.stringify({ subcategory_id: 'ffffffffffffffffffffffff' }));
    const service = await build();

    const draft = await service.parse(USER_ID, 'uber 30');

    expect(draft.subcategory_id).toBeNull();
    expect(draft.account_id).toBe(INTER.toString());
  });

  it('returns a partial draft when there is no API key', async () => {
    delete process.env.GROQ_API_KEY;
    stubTransactions({ latest: { account_id: INTER } });
    const service = await build();

    const draft = await service.parse(USER_ID, 'uber 30 ontem');

    expect(draft).toMatchObject({
      name: 'Uber',
      amount: 30,
      type: 'EXPENSE',
      subcategory_id: null,
    });
    expect(draft.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns a partial draft when Groq fails', async () => {
    stubTransactions({});
    mockCreate.mockRejectedValue(new Error('network down'));
    const service = await build();

    const draft = await service.parse(USER_ID, 'uber 30');

    expect(draft).toMatchObject({
      amount: 30,
      subcategory_id: null,
      account_id: null,
    });
  });

  it('returns a partial draft when Groq answers invalid JSON', async () => {
    stubTransactions({});
    groqAnswers('not json');
    const service = await build();

    expect((await service.parse(USER_ID, 'uber 30')).subcategory_id).toBeNull();
  });

  it("only looks at the authenticated user's transactions, accent- and case-insensitively", async () => {
    stubTransactions({});
    groqAnswers(JSON.stringify({ subcategory_id: null }));
    const service = await build();

    await service.parse(USER_ID, 'café 10');

    for (const [{ where }] of transactionRepo.findOne.mock.calls) {
      expect(where.user_id).toBe(USER_ID);
    }
    const history = transactionRepo.findOne.mock.calls[0][0].where;
    expect(history.name.$regex.test('CAFE')).toBe(true);
    expect(history.name.$regex.test('Café')).toBe(true);
    expect(history.name.$regex.test('Café da manhã')).toBe(false);
  });

  it('does not look up history or call Groq when no name could be extracted', async () => {
    stubTransactions({ latest: { account_id: INTER } });
    const service = await build();

    const draft = await service.parse(USER_ID, '87,50');

    expect(draft).toMatchObject({
      name: '',
      amount: 87.5,
      subcategory_id: null,
      account_id: INTER.toString(),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
