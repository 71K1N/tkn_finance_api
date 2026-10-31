import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TransactionService } from './transaction.service';
import { Transaction } from './entities/transaction.entity';
import { BankAccount } from '../bank-account/entities/bank-account.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';
import { BudgetService } from '../budget/budget.service';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';
import { SummaryStatus } from './summary-status.enum';
import {
  APP_TIMEZONE,
  dayKeyOf,
  dayToRange,
  monthToRange,
} from '../common/date/month-range.util';

/** The settled-amount accumulator the service is expected to build. */
const SETTLED_AMOUNT_EXPRESSION = {
  $cond: [{ $gt: ['$paid_amount', 0] }, '$paid_amount', '$amount'],
};

jest.mock('../common/pagination/paginate.util', () => ({
  paginate: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
}));

describe('TransactionService', () => {
  let service: TransactionService;
  let transactionRepository: {
    findOne: jest.Mock;
    aggregate: jest.Mock;
    find: jest.Mock;
  };
  let bankAccountRepository: { findOne: jest.Mock; find: jest.Mock };
  let subcategoryRepository: { find: jest.Mock; findOne: jest.Mock };
  let mongoManager: {
    insertOne: jest.Mock;
    insertMany: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
  };
  let dataSource: any;

  const USER_ID = 7;
  const OTHER_USER_ID = 99;

  /** The $match stage of the pipeline handed to the last aggregate() call. */
  const lastMatchStage = () => {
    const pipeline = transactionRepository.aggregate.mock.calls.at(-1)?.[0];
    return pipeline.find((stage: Record<string, any>) => '$match' in stage)
      .$match;
  };

  /** The due_date/payment_date range from the last $match's `$or` clause. */
  const lastMatchOrClause = (field: 'due_date' | 'payment_date') =>
    (lastMatchStage().$or as Record<string, any>[]).find(
      (clause) => field in clause,
    )?.[field];

  /** Mongo-style range check ($gte/$gt/$lte/$lt) against a single field value. */
  const matchesRange = (
    value: string | Date | null | undefined,
    range: Record<string, string | Date> | undefined,
  ): boolean => {
    if (!range || value === null || value === undefined) return false;
    if ('$gte' in range && !(value >= range.$gte)) return false;
    if ('$gt' in range && !(value > range.$gt)) return false;
    if ('$lte' in range && !(value <= range.$lte)) return false;
    if ('$lt' in range && !(value < range.$lt)) return false;
    return true;
  };

  /** Whether a `{ due_date, payment_date }` doc would satisfy a getSummary $match's `$or`. */
  const matchIncludes = (
    match: Record<string, any>,
    doc: { due_date?: string | null; payment_date?: Date | null },
  ): boolean =>
    (match.$or as Record<string, any>[]).some((clause) => {
      if ('due_date' in clause)
        return matchesRange(doc.due_date, clause.due_date);
      if ('payment_date' in clause)
        return matchesRange(doc.payment_date, clause.payment_date);
      return false;
    });

  /** The $group stage of the pipeline handed to the last aggregate() call. */
  const lastGroupStage = () => {
    const pipeline = transactionRepository.aggregate.mock.calls.at(-1)?.[0];
    return pipeline.find((stage: Record<string, any>) => '$group' in stage)
      .$group;
  };

  /** The accumulator expression the last aggregate() call sums into `total`. */
  const lastSumExpression = () => lastGroupStage().total.$sum;

  /**
   * Whether a doc satisfies a getSummary $match, for any status — the `$or` form
   * (ALL) as well as the flat due_date/payment_date forms (PAID/PENDING). A `null`
   * clause value means "absent or null", matching Mongo's own semantics.
   */
  const docMatches = (
    match: Record<string, any>,
    doc: { due_date?: string | null; payment_date?: Date | null },
  ): boolean => {
    if (match.$or) return matchIncludes(match, doc);

    const fieldMatches = (
      field: 'due_date' | 'payment_date',
      value: string | Date | null | undefined,
    ): boolean => {
      if (!(field in match)) return true;
      if (match[field] === null) return value === null || value === undefined;
      return matchesRange(value, match[field]);
    };

    return (
      fieldMatches('due_date', doc.due_date) &&
      fieldMatches('payment_date', doc.payment_date)
    );
  };

  /** Evaluates the settled-amount `$cond` the way Mongo would, against one doc. */
  const evalSettled = (
    expr: any,
    doc: { amount: number; paid_amount?: number | null },
  ): number => {
    if (expr === '$amount') return doc.amount;
    const [condition, whenTrue, whenFalse] = expr.$cond;
    const [fieldRef, threshold] = condition.$gt;
    const fieldValue = (doc as Record<string, any>)[fieldRef.slice(1)];
    const picked =
      typeof fieldValue === 'number' && fieldValue > threshold
        ? whenTrue
        : whenFalse;
    return (doc as Record<string, any>)[picked.slice(1)];
  };

  /** The options object handed to the last paginate() call. */
  const lastPaginateOptions = () =>
    (paginate as jest.Mock).mock.calls.at(-1)?.[2];

  /** Every `updateOne`/`insertOne`/etc. call made against `BankAccount`. */
  const bankAccountCalls = (method: keyof typeof mongoManager) =>
    mongoManager[method].mock.calls.filter(
      ([entity]) => entity === BankAccount,
    );

  const transactionCalls = (method: keyof typeof mongoManager) =>
    mongoManager[method].mock.calls.filter(
      ([entity]) => entity === Transaction,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    transactionRepository = {
      findOne: jest.fn(),
      aggregate: jest.fn().mockReturnValue({ toArray: async () => [] }),
      find: jest.fn().mockResolvedValue([]),
    };
    bankAccountRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    subcategoryRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    mongoManager = {
      insertOne: jest.fn().mockResolvedValue(undefined),
      insertMany: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn().mockResolvedValue(undefined),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      mongoManager,
      driver: {
        queryRunner: {
          databaseConnection: {
            startSession: () => ({
              withTransaction: async (fn: () => Promise<void>) => {
                await fn();
              },
              endSession: jest.fn().mockResolvedValue(undefined),
            }),
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: bankAccountRepository,
        },
        {
          provide: getRepositoryToken(Subcategory),
          useValue: subcategoryRepository,
        },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: BudgetService, useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  describe('create', () => {
    const accountId = ObjectId.createFromHexString('507f1f77bcf86cd799439012');
    const newId = ObjectId.createFromHexString('507f1f77bcf86cd799439099');
    const baseDto: CreateTransactionDto = {
      amount: 100,
      account_id: accountId.toString(),
      type: 'EXPENSE',
    } as CreateTransactionDto;

    beforeEach(() => {
      bankAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        balance: 500,
      } as unknown as BankAccount);
      transactionRepository.findOne.mockResolvedValue({
        id: newId,
        type: 'EXPENSE',
      } as unknown as Transaction);
    });

    it('takes the owner from the authenticated user, not the request body', async () => {
      await service.create(baseDto, USER_ID);

      const [insertedDoc] = transactionCalls('insertOne')[0];
      expect(insertedDoc).toBe(Transaction);
      const [, doc] = transactionCalls('insertOne')[0];
      expect(doc.user_id).toBe(USER_ID);
      expect(doc.created_by).toBe(USER_ID);
      expect(doc.updated_by).toBe(USER_ID);
    });

    it('does not move the balance for an unpaid transaction', async () => {
      await service.create(baseDto, USER_ID);

      expect(bankAccountCalls('updateOne')).toHaveLength(0);
    });

    it('applies the balance effect when created already paid', async () => {
      await service.create(
        {
          ...baseDto,
          payment_date: new Date('2026-07-01'),
          paid_amount: 100,
        } as any,
        USER_ID,
      );

      const [, filter, update] = bankAccountCalls('updateOne')[0];
      expect(filter).toEqual({ _id: accountId });
      expect(update).toEqual({ $inc: { balance: -100 } });
    });

    it('writes the transaction and the balance update inside the same session', async () => {
      await service.create(
        {
          ...baseDto,
          payment_date: new Date('2026-07-01'),
          paid_amount: 100,
        } as any,
        USER_ID,
      );

      const [, , insertOptions] = transactionCalls('insertOne')[0];
      const [, , , updateOptions] = bankAccountCalls('updateOne')[0];
      expect(insertOptions.session).toBe(updateOptions.session);
    });

    describe('transfer', () => {
      const targetAccountId = ObjectId.createFromHexString(
        '507f1f77bcf86cd799439013',
      );
      const transferDto: CreateTransactionDto = {
        amount: 50,
        account_id: accountId.toString(),
        target_account_id: targetAccountId.toString(),
        type: 'transfer',
        subcategory_id: '507f1f77bcf86cd799439014',
      } as CreateTransactionDto;

      beforeEach(() => {
        bankAccountRepository.findOne.mockImplementation(({ where }: any) => {
          const id = where._id.toString();
          if (id === accountId.toString()) {
            return Promise.resolve({ id: accountId, balance: 500 });
          }
          if (id === targetAccountId.toString()) {
            return Promise.resolve({ id: targetAccountId, balance: 100 });
          }
          return Promise.resolve(null);
        });
        subcategoryRepository.findOne.mockResolvedValue({
          id: ObjectId.createFromHexString('507f1f77bcf86cd799439014'),
        });
      });

      it('writes both legs sharing one transfer_group_id, with the target-side leg marked as mirror', async () => {
        await service.create(transferDto, USER_ID);

        const [, docs] = transactionCalls('insertMany')[0];
        expect(docs).toHaveLength(2);
        const [source, mirror] = docs;
        expect(source.transfer_group_id).toEqual(mirror.transfer_group_id);
        expect(source.is_transfer_mirror).toBe(false);
        expect(mirror.is_transfer_mirror).toBe(true);
      });

      it('converts subcategory_id to an ObjectId on both legs', async () => {
        await service.create(transferDto, USER_ID);

        const [, docs] = transactionCalls('insertMany')[0];
        for (const doc of docs) {
          expect(doc.subcategory_id).toBeInstanceOf(ObjectId);
        }
      });

      it('debits the source and credits the target unconditionally, regardless of payment', async () => {
        await service.create(transferDto, USER_ID);

        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: -50 } },
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: targetAccountId },
          { $inc: { balance: 50 } },
          expect.anything(),
        ]);
      });
    });
  });

  describe('findOne', () => {
    const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');

    it('returns the transaction when it belongs to the caller', async () => {
      const transaction = { id, user_id: USER_ID } as unknown as Transaction;
      transactionRepository.findOne.mockResolvedValue(transaction);

      const result = await service.findOne(id, USER_ID);

      expect(result).toBe(transaction);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { _id: id, user_id: USER_ID },
      });
    });

    it('throws NotFoundException when the transaction does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(id, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException instead of disclosing another user's transaction", async () => {
      // Scoped in the query itself, so a mismatched owner looks identical to "not found".
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(id, OTHER_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');
    const accountId = ObjectId.createFromHexString('507f1f77bcf86cd799439012');

    function existingTransaction(overrides: Partial<Transaction> = {}) {
      return {
        id,
        user_id: USER_ID,
        type: 'EXPENSE',
        amount: 100,
        account_id: accountId,
        payment_date: null,
        paid_amount: null,
        is_planned: false,
        ...overrides,
      } as unknown as Transaction;
    }

    it('throws NotFoundException when the transaction does not exist or is owned by another user', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(id, { amount: 200 } as any, USER_ID),
      ).rejects.toThrow(NotFoundException);
      expect(mongoManager.updateOne).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the authenticated user', async () => {
      transactionRepository.findOne.mockResolvedValue(existingTransaction());

      await service.update(id, { amount: 200 } as any, USER_ID);

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { _id: id, user_id: USER_ID },
      });
    });

    it('records the acting user as updated_by', async () => {
      transactionRepository.findOne.mockResolvedValue(existingTransaction());

      await service.update(id, { amount: 200 } as any, USER_ID);

      const [, , update] = transactionCalls('updateOne')[0];
      expect(update.$set.updated_by).toBe(USER_ID);
    });

    it('preserves is_planned across the update, ignoring any value in the body', async () => {
      transactionRepository.findOne.mockResolvedValue(
        existingTransaction({ is_planned: true }),
      );

      await service.update(id, { amount: 200 } as any, USER_ID);

      const [, , update] = transactionCalls('updateOne')[0];
      expect(update.$set.is_planned).toBe(true);
    });

    it('normalizes a cleared due_date to null rather than leaving it undefined', async () => {
      transactionRepository.findOne.mockResolvedValue(
        existingTransaction({ due_date: '2026-07-31' } as any),
      );

      await service.update(id, { due_date: undefined } as any, USER_ID);

      const [, , update] = transactionCalls('updateOne')[0];
      expect(update.$set.due_date).toBeNull();
    });

    it('rejects pointing a transaction at an account owned by another user', async () => {
      transactionRepository.findOne.mockResolvedValue(existingTransaction());
      bankAccountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(
          id,
          { account_id: '507f1f77bcf86cd799439015' } as any,
          USER_ID,
        ),
      ).rejects.toThrow('Account not found');
      expect(bankAccountRepository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ user_id: USER_ID }),
      });
    });

    it("rejects another user's private subcategory", async () => {
      transactionRepository.findOne.mockResolvedValue(existingTransaction());
      subcategoryRepository.findOne.mockResolvedValue({ user_id: USER_ID + 1 });

      await expect(
        service.update(
          id,
          { subcategory_id: '507f1f77bcf86cd799439014' } as any,
          USER_ID,
        ),
      ).rejects.toThrow('Subcategory not found');
    });

    it('converts subcategory_id to an ObjectId', async () => {
      transactionRepository.findOne.mockResolvedValue(existingTransaction());
      subcategoryRepository.findOne.mockResolvedValue({ user_id: null });
      const subcategoryId = '507f1f77bcf86cd799439014';

      await service.update(
        id,
        { subcategory_id: subcategoryId } as any,
        USER_ID,
      );

      const [, , update] = transactionCalls('updateOne')[0];
      expect(update.$set.subcategory_id).toEqual(
        ObjectId.createFromHexString(subcategoryId),
      );
    });

    describe('balance reconciliation', () => {
      it('does not touch the balance when editing an unpaid transaction', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransaction());

        await service.update(id, { amount: 200 } as any, USER_ID);

        expect(bankAccountCalls('updateOne')).toHaveLength(0);
      });

      it('reverses the old amount and applies the new one when editing a paid transaction', async () => {
        transactionRepository.findOne.mockResolvedValue(
          existingTransaction({
            payment_date: new Date('2026-07-01'),
            paid_amount: 100,
          }),
        );

        await service.update(id, { paid_amount: 150 } as any, USER_ID);

        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: 100 } }, // reverse the old expense effect (-100)
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: -150 } }, // apply the new expense effect
          expect.anything(),
        ]);
      });

      it('moves the balance effect to the new account when the account changes', async () => {
        const newAccountId = ObjectId.createFromHexString(
          '507f1f77bcf86cd799439015',
        );
        transactionRepository.findOne.mockResolvedValue(
          existingTransaction({
            payment_date: new Date('2026-07-01'),
            paid_amount: 100,
          }),
        );
        bankAccountRepository.findOne.mockResolvedValue({ user_id: USER_ID });

        await service.update(
          id,
          { account_id: newAccountId.toString() } as any,
          USER_ID,
        );

        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: 100 } },
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: newAccountId },
          { $inc: { balance: -100 } },
          expect.anything(),
        ]);
      });

      it('flips the balance effect when the type changes from expense to income', async () => {
        transactionRepository.findOne.mockResolvedValue(
          existingTransaction({
            payment_date: new Date('2026-07-01'),
            paid_amount: 100,
          }),
        );

        await service.update(id, { type: 'INCOME' } as any, USER_ID);

        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: 100 } }, // reverse old expense effect
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: 100 } }, // apply new income effect
          expect.anything(),
        ]);
      });

      it('applies the balance effect when payment is recorded through an update', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransaction());

        await service.update(
          id,
          { payment_date: new Date('2026-07-01'), paid_amount: 100 } as any,
          USER_ID,
        );

        const calls = bankAccountCalls('updateOne');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: -100 } },
          expect.anything(),
        ]);
      });

      it('reverses the balance effect when payment is cleared through an update', async () => {
        transactionRepository.findOne.mockResolvedValue(
          existingTransaction({
            payment_date: new Date('2026-07-01'),
            paid_amount: 100,
          }),
        );

        await service.update(id, { payment_date: null } as any, USER_ID);

        const calls = bankAccountCalls('updateOne');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: 100 } },
          expect.anything(),
        ]);
      });

      it('does not leave a partial balance adjustment when the write fails', async () => {
        transactionRepository.findOne.mockResolvedValue(
          existingTransaction({
            payment_date: new Date('2026-07-01'),
            paid_amount: 100,
          }),
        );
        mongoManager.updateOne.mockImplementation((entity: any) => {
          if (entity === Transaction) {
            throw new Error('write failed');
          }
          return Promise.resolve(undefined);
        });

        await expect(
          service.update(id, { paid_amount: 150 } as any, USER_ID),
        ).rejects.toThrow('write failed');
        expect(bankAccountCalls('updateOne')).toHaveLength(0);
      });
    });

    describe('transfers', () => {
      function existingTransfer(overrides: Partial<Transaction> = {}) {
        return existingTransaction({
          type: 'transfer',
          target_account_id: ObjectId.createFromHexString(
            '507f1f77bcf86cd799439013',
          ),
          ...overrides,
        } as any);
      }

      it('rejects a change to amount', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransfer());

        await expect(
          service.update(id, { amount: 200 } as any, USER_ID),
        ).rejects.toThrow(BadRequestException);
        expect(mongoManager.updateOne).not.toHaveBeenCalled();
      });

      it('rejects a change to account_id', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransfer());

        await expect(
          service.update(
            id,
            { account_id: '507f1f77bcf86cd799439099' } as any,
            USER_ID,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects a change to target_account_id', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransfer());

        await expect(
          service.update(
            id,
            { target_account_id: '507f1f77bcf86cd799439099' } as any,
            USER_ID,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('allows editing non-balance fields without touching any balance', async () => {
        transactionRepository.findOne.mockResolvedValue(existingTransfer());

        await service.update(id, { name: 'Renamed' } as any, USER_ID);

        expect(bankAccountCalls('updateOne')).toHaveLength(0);
        const [, , update] = transactionCalls('updateOne')[0];
        expect(update.$set.name).toBe('Renamed');
      });
    });
  });

  describe('remove', () => {
    const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');
    const accountId = ObjectId.createFromHexString('507f1f77bcf86cd799439012');

    it('throws NotFoundException when the transaction does not exist or is owned by another user', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(id, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mongoManager.deleteOne).not.toHaveBeenCalled();
    });

    it('deletes the transaction and does not touch the balance when unpaid', async () => {
      transactionRepository.findOne.mockResolvedValue({
        id,
        user_id: USER_ID,
        type: 'EXPENSE',
        account_id: accountId,
        payment_date: null,
      } as unknown as Transaction);

      const result = await service.remove(id, USER_ID);

      expect(transactionCalls('deleteOne')).toHaveLength(1);
      expect(bankAccountCalls('updateOne')).toHaveLength(0);
      expect(result).toEqual({ deleted: true });
    });

    it('reverses the balance effect of a paid expense', async () => {
      transactionRepository.findOne.mockResolvedValue({
        id,
        user_id: USER_ID,
        type: 'EXPENSE',
        account_id: accountId,
        payment_date: new Date('2026-07-01'),
        paid_amount: 100,
      } as unknown as Transaction);

      await service.remove(id, USER_ID);

      const [, , update] = bankAccountCalls('updateOne')[0];
      expect(update).toEqual({ $inc: { balance: 100 } });
    });

    describe('transfers', () => {
      const groupId = ObjectId.createFromHexString('507f1f77bcf86cd799439020');
      const targetAccountId = ObjectId.createFromHexString(
        '507f1f77bcf86cd799439013',
      );
      const siblingId = ObjectId.createFromHexString(
        '507f1f77bcf86cd799439021',
      );

      it('deletes both legs and reverses the movement on both accounts', async () => {
        const authoritativeLeg = {
          id,
          user_id: USER_ID,
          type: 'transfer',
          account_id: accountId,
          target_account_id: targetAccountId,
          amount: 50,
          transfer_group_id: groupId,
          is_transfer_mirror: false,
        } as unknown as Transaction;
        const mirrorLeg = {
          id: siblingId,
          user_id: USER_ID,
          type: 'transfer',
          account_id: targetAccountId,
          target_account_id: accountId,
          amount: 50,
          transfer_group_id: groupId,
          is_transfer_mirror: true,
        } as unknown as Transaction;
        transactionRepository.findOne.mockImplementation(({ where }: any) => {
          if (where._id) return Promise.resolve(authoritativeLeg);
          return Promise.resolve(mirrorLeg);
        });

        await service.remove(id, USER_ID);

        expect(transactionCalls('deleteOne')).toHaveLength(2);
        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: -50 } },
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: targetAccountId },
          { $inc: { balance: 50 } },
          expect.anything(),
        ]);
      });

      it('reverses using the deleted leg alone when no sibling can be found (legacy transfer)', async () => {
        const legacyLeg = {
          id,
          user_id: USER_ID,
          type: 'transfer',
          account_id: accountId,
          target_account_id: targetAccountId,
          amount: 50,
          transfer_group_id: null,
        } as unknown as Transaction;
        transactionRepository.findOne.mockResolvedValue(legacyLeg);

        await expect(service.remove(id, USER_ID)).resolves.toEqual({
          deleted: true,
        });

        expect(transactionCalls('deleteOne')).toHaveLength(1);
        const calls = bankAccountCalls('updateOne');
        expect(calls).toContainEqual([
          BankAccount,
          { _id: accountId },
          { $inc: { balance: -50 } },
          expect.anything(),
        ]);
        expect(calls).toContainEqual([
          BankAccount,
          { _id: targetAccountId },
          { $inc: { balance: 50 } },
          expect.anything(),
        ]);
      });
    });
  });

  describe('payment', () => {
    const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');
    const accountId = ObjectId.createFromHexString('507f1f77bcf86cd799439012');
    const paymentDto: PaymentTransactionDto = { paid_amount: 50 } as any;

    it('throws NotFoundException when the transaction does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.payment(id, paymentDto, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mongoManager.updateOne).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the authenticated user', async () => {
      transactionRepository.findOne.mockResolvedValue({
        id,
        user_id: USER_ID,
        type: 'income',
        account_id: accountId,
      } as unknown as Transaction);

      await service.payment(id, paymentDto, USER_ID);

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { _id: id, user_id: USER_ID },
      });
    });

    it('throws ConflictException and leaves the balance untouched when already paid', async () => {
      transactionRepository.findOne.mockResolvedValue({
        id,
        user_id: USER_ID,
        type: 'expense',
        account_id: accountId,
        payment_date: new Date('2026-01-01'),
        paid_amount: 30,
      } as unknown as Transaction);

      await expect(service.payment(id, paymentDto, USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(mongoManager.updateOne).not.toHaveBeenCalled();
    });

    it('applies the balance change, records payment, and records the acting user', async () => {
      transactionRepository.findOne
        .mockResolvedValueOnce({
          id,
          user_id: USER_ID,
          type: 'income',
          account_id: accountId,
          payment_date: null,
        } as unknown as Transaction)
        .mockResolvedValueOnce({
          id,
          payment_date: new Date(),
          paid_amount: 50,
        } as unknown as Transaction);

      const result = await service.payment(id, paymentDto, USER_ID);

      const [, , transactionUpdate] = transactionCalls('updateOne')[0];
      expect(transactionUpdate.$set.paid_amount).toBe(50);
      expect(transactionUpdate.$set.updated_by).toBe(USER_ID);
      const [, , accountUpdate] = bankAccountCalls('updateOne')[0];
      expect(accountUpdate).toEqual({ $inc: { balance: 50 } });
      expect(result?.paid_amount).toBe(50);
    });
  });

  // The transaction list is what the DataTable calls. It does not go through
  // monthToRange — it applies the browser-supplied from/to as a range over due_date OR
  // payment_date, so unplanned (no due_date) transactions still show up by payment_date.
  describe('findAll (transaction list)', () => {
    const query = { page: 1, pageSize: 10 } as FindAllQueryDto;
    const categoryId = '507f1f77bcf86cd799439013';

    it('scopes every query to the authenticated user', async () => {
      await service.findAll(7, query);

      expect(lastPaginateOptions().baseWhere).toEqual({ user_id: 7 });
    });

    it('applies from/to as an inclusive string range over due_date, OR a matching UTC range over payment_date', async () => {
      await service.findAll(1, query, { from: '2026-07-01', to: '2026-07-31' });

      expect(lastPaginateOptions().baseWhere.$or).toEqual([
        { due_date: { $gte: '2026-07-01', $lte: '2026-07-31' } },
        {
          payment_date: {
            $gte: new Date('2026-07-01T03:00:00.000Z'),
            $lt: new Date('2026-08-01T03:00:00.000Z'),
          },
        },
      ]);
    });

    it('keeps both branches of the range open-ended when only one bound is given', async () => {
      await service.findAll(1, query, { from: '2026-07-01' });

      expect(lastPaginateOptions().baseWhere.$or).toEqual([
        { due_date: { $gte: '2026-07-01' } },
        { payment_date: { $gte: new Date('2026-07-01T03:00:00.000Z') } },
      ]);
    });

    it('omits the date range filter entirely when no range is given', async () => {
      await service.findAll(1, query);

      expect(lastPaginateOptions().baseWhere).not.toHaveProperty('due_date');
      expect(lastPaginateOptions().baseWhere).not.toHaveProperty('$or');
    });

    // The frontend now derives from/to with local getters (currentMonthRange), so the
    // last day of the month must survive the round trip as an inclusive upper bound.
    it('includes the last day of the month in the range', async () => {
      const { from, to } = { from: '2026-07-01', to: '2026-07-31' };
      await service.findAll(1, query, { from, to });
      const [{ due_date }, { payment_date }] = lastPaginateOptions().baseWhere
        .$or as [{ due_date: any }, { payment_date: any }];

      expect(
        '2026-07-31' >= due_date.$gte && '2026-07-31' <= due_date.$lte,
      ).toBe(true);
      // Payment made late on July 31st in Brasília is still before August 1st 03:00Z.
      const lateJuly31Brasilia = new Date('2026-07-31T23:00:00.000Z');
      expect(lateJuly31Brasilia >= payment_date.$gte).toBe(true);
      expect(lateJuly31Brasilia < payment_date.$lt).toBe(true);
    });

    it('matches an unplanned (no due_date) transaction by payment_date alone', async () => {
      await service.findAll(1, query, { from: '2026-07-01', to: '2026-07-31' });
      const [, { payment_date }] = lastPaginateOptions().baseWhere.$or as [
        unknown,
        { payment_date: { $gte: Date; $lt: Date } },
      ];

      const paidJuly15 = new Date('2026-07-15T13:00:00.000Z');
      expect(
        paidJuly15 >= payment_date.$gte && paidJuly15 < payment_date.$lt,
      ).toBe(true);
    });

    it('expands category_id into the matching subcategory ids', async () => {
      const subId = ObjectId.createFromHexString('507f1f77bcf86cd799439014');
      subcategoryRepository.find.mockResolvedValue([{ id: subId }]);

      await service.findAll(1, query, { category_id: categoryId });

      expect(lastPaginateOptions().baseWhere.subcategory_id).toEqual({
        $in: [subId],
      });
    });

    it('lets an explicit subcategory filter win over category_id', async () => {
      await service.findAll(
        1,
        { ...query, filters: { subcategory_id: 'abc' } } as FindAllQueryDto,
        { category_id: categoryId },
      );

      expect(lastPaginateOptions().baseWhere).not.toHaveProperty(
        'subcategory_id',
      );
      expect(subcategoryRepository.find).not.toHaveBeenCalled();
    });

    it('computes is_planned before filtering so legacy rows are still classified', async () => {
      await service.findAll(1, query);
      const [preStage] = lastPaginateOptions().preQueryStages;

      expect(preStage.$set.is_planned).toBeDefined();
      expect(lastPaginateOptions().filterableFields).toContain('is_planned');
      expect(lastPaginateOptions().sortableFields).toContain('is_planned');
    });
  });

  // July's range used to end at 2026-07-31T00:00Z, so everything paid on the 31st was
  // silently excluded from the dashboard. The boundary now sits at the start of August
  // in America/Sao_Paulo.
  describe('month boundaries', () => {
    const JULY_START = new Date('2026-07-01T03:00:00.000Z');
    const AUGUST_START = new Date('2026-08-01T03:00:00.000Z');

    it('getSummary matches the full month when given month=2026-07', async () => {
      await service.getSummary(1, { month: '2026-07' });

      expect(lastMatchOrClause('payment_date')).toEqual({
        $gte: JULY_START,
        $lt: AUGUST_START,
      });
      expect(lastMatchOrClause('due_date')).toEqual({
        $gte: '2026-07-01',
        $lt: '2026-08-01',
      });
    });

    it('getCategoryBreakdown matches the full month', async () => {
      await service.getCategoryBreakdown(1, '2026-07');

      expect(lastMatchStage().payment_date).toEqual({
        $gte: JULY_START,
        $lt: AUGUST_START,
      });
    });

    it('getPlannedVsUnplanned matches the full month', async () => {
      const result = await service.getPlannedVsUnplanned(1, '2026-07');

      expect(lastMatchStage().payment_date).toEqual({
        $gte: JULY_START,
        $lt: AUGUST_START,
      });
      expect(result.month).toBe('2026-07');
    });

    it('includes a payment made late on the last day of the month', async () => {
      // 2026-07-31 22:00 in Brasília — already 2026-08-01 in UTC.
      const lateOnTheLastDay = new Date('2026-08-01T01:00:00.000Z');
      await service.getSummary(1, { month: '2026-07' });
      const { $gte, $lt } = lastMatchOrClause('payment_date');

      expect(lateOnTheLastDay >= $gte && lateOnTheLastDay < $lt).toBe(true);
    });

    it('rejects a malformed month instead of passing Invalid Date to Mongo', async () => {
      await expect(service.getSummary(1, { month: 'lixo' })).rejects.toThrow(
        BadRequestException,
      );
      expect(transactionRepository.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('getSummary period matching', () => {
    it('month: includes a planned transaction due in the month but not yet paid', async () => {
      await service.getSummary(1, { month: '2026-08' });
      const match = lastMatchStage();

      expect(
        matchIncludes(match, { due_date: '2026-08-15', payment_date: null }),
      ).toBe(true);
    });

    it('month: includes an unplanned transaction paid within the month', async () => {
      await service.getSummary(1, { month: '2026-08' });
      const match = lastMatchStage();

      expect(
        matchIncludes(match, {
          due_date: null,
          payment_date: new Date('2026-08-15T12:00:00.000Z'),
        }),
      ).toBe(true);
    });

    it('from/to: includes an unplanned transaction paid within the range', async () => {
      // This is the path that was silently dropping every unplanned transaction
      // before this fix — due_date-only matching can never see a doc with no due_date.
      await service.getSummary(1, { from: '2026-08-01', to: '2026-08-31' });
      const match = lastMatchStage();

      expect(
        matchIncludes(match, {
          due_date: null,
          payment_date: new Date('2026-08-15T12:00:00.000Z'),
        }),
      ).toBe(true);
    });

    it('from/to: includes a planned transaction due in the range even if paid outside it', async () => {
      await service.getSummary(1, { from: '2026-08-01', to: '2026-08-31' });
      const match = lastMatchStage();

      expect(
        matchIncludes(match, {
          due_date: '2026-08-15',
          payment_date: new Date('2026-09-05T12:00:00.000Z'),
        }),
      ).toBe(true);
    });

    it('excludes a transaction with neither date inside the period', async () => {
      await service.getSummary(1, { month: '2026-08' });
      const match = lastMatchStage();

      expect(
        matchIncludes(match, {
          due_date: '2026-07-15',
          payment_date: new Date('2026-09-15T12:00:00.000Z'),
        }),
      ).toBe(false);
    });

    it('month and the equivalent from/to range produce identical inclusion decisions', async () => {
      await service.getSummary(1, { month: '2026-08' });
      const monthMatch = lastMatchStage();

      await service.getSummary(1, { from: '2026-08-01', to: '2026-08-31' });
      const rangeMatch = lastMatchStage();

      const sampleDocs = [
        { due_date: '2026-08-01', payment_date: null },
        { due_date: '2026-08-31', payment_date: null },
        { due_date: null, payment_date: new Date('2026-08-01T03:00:00.000Z') },
        { due_date: null, payment_date: new Date('2026-08-31T23:00:00.000Z') },
        { due_date: '2026-07-31', payment_date: null },
        { due_date: null, payment_date: new Date('2026-09-01T03:00:00.000Z') },
      ];

      for (const doc of sampleDocs) {
        expect(matchIncludes(monthMatch, doc)).toBe(
          matchIncludes(rangeMatch, doc),
        );
      }
    });
  });

  describe('getSummary status filter', () => {
    const AUGUST = '2026-08';
    const AUGUST_RANGE = { from: '2026-08-01', to: '2026-08-31' };

    const inAugust = new Date('2026-08-15T12:00:00.000Z');
    const inSeptember = new Date('2026-09-05T12:00:00.000Z');

    it('omitting status produces the same $match as status=all', async () => {
      await service.getSummary(1, { month: AUGUST });
      const implicitMatch = lastMatchStage();

      await service.getSummary(1, {
        month: AUGUST,
        status: SummaryStatus.ALL,
      });

      expect(lastMatchStage()).toEqual(implicitMatch);
    });

    it('omitting status sums the planned amount, unchanged from before', async () => {
      await service.getSummary(1, { month: AUGUST });

      expect(lastSumExpression()).toBe('$amount');
    });

    describe('status=paid', () => {
      const paid = { month: AUGUST, status: SummaryStatus.PAID };

      it('matches on payment_date alone, with no due_date arm', async () => {
        await service.getSummary(1, paid);
        const match = lastMatchStage();

        expect(match.$or).toBeUndefined();
        expect(match.due_date).toBeUndefined();
        expect(match.payment_date).toEqual({
          $gte: new Date('2026-08-01T03:00:00.000Z'),
          $lt: new Date('2026-09-01T03:00:00.000Z'),
        });
      });

      it('includes a transaction paid inside the period', async () => {
        await service.getSummary(1, paid);

        expect(
          docMatches(lastMatchStage(), {
            due_date: '2026-08-10',
            payment_date: inAugust,
          }),
        ).toBe(true);
      });

      it('excludes a transaction due inside the period but not yet paid', async () => {
        await service.getSummary(1, paid);

        expect(
          docMatches(lastMatchStage(), {
            due_date: '2026-08-10',
            payment_date: null,
          }),
        ).toBe(false);
      });

      it('excludes a transaction due inside the period but paid outside it', async () => {
        await service.getSummary(1, paid);

        expect(
          docMatches(lastMatchStage(), {
            due_date: '2026-08-10',
            payment_date: inSeptember,
          }),
        ).toBe(false);
      });

      it('includes a transaction paid inside the period but due outside it', async () => {
        await service.getSummary(1, paid);

        expect(
          docMatches(lastMatchStage(), {
            due_date: '2026-07-10',
            payment_date: inAugust,
          }),
        ).toBe(true);
      });

      it('sums the settled amount, not the planned one', async () => {
        await service.getSummary(1, paid);

        expect(lastSumExpression()).toEqual(SETTLED_AMOUNT_EXPRESSION);
      });
    });

    describe('status=pending', () => {
      const pending = { month: AUGUST, status: SummaryStatus.PENDING };

      it('matches due_date in the period AND an absent payment_date', async () => {
        await service.getSummary(1, pending);
        const match = lastMatchStage();

        expect(match.$or).toBeUndefined();
        expect(match.due_date).toEqual({
          $gte: '2026-08-01',
          $lt: '2026-09-01',
        });
        expect(match.payment_date).toBeNull();
      });

      it('includes a transaction due in the period and unpaid', async () => {
        await service.getSummary(1, pending);

        expect(
          docMatches(lastMatchStage(), {
            due_date: '2026-08-10',
            payment_date: null,
          }),
        ).toBe(true);
      });

      it('excludes a transaction due in the period but already paid', async () => {
        await service.getSummary(1, pending);
        const match = lastMatchStage();

        // Paid inside the period and paid outside it are both excluded — pending
        // is about what is still owed, not about when it settled.
        expect(
          docMatches(match, { due_date: '2026-08-10', payment_date: inAugust }),
        ).toBe(false);
        expect(
          docMatches(match, {
            due_date: '2026-08-10',
            payment_date: inSeptember,
          }),
        ).toBe(false);
      });

      it('never includes an unplanned transaction (no due_date)', async () => {
        await service.getSummary(1, pending);

        expect(
          docMatches(lastMatchStage(), {
            due_date: null,
            payment_date: null,
          }),
        ).toBe(false);
      });

      it('sums the planned amount', async () => {
        await service.getSummary(1, pending);

        expect(lastSumExpression()).toBe('$amount');
      });
    });

    describe('settled amount fallback', () => {
      // The expression is evaluated here the way Mongo would, so these assert the
      // stated behaviour rather than just the shape of the pipeline.
      it('uses paid_amount when a real value was recorded', () => {
        expect(
          evalSettled(SETTLED_AMOUNT_EXPRESSION, {
            amount: 100,
            paid_amount: 90,
          }),
        ).toBe(90);
      });

      it('falls back to amount when paid_amount is absent', () => {
        expect(evalSettled(SETTLED_AMOUNT_EXPRESSION, { amount: 100 })).toBe(
          100,
        );
      });

      it('falls back to amount when paid_amount is null', () => {
        expect(
          evalSettled(SETTLED_AMOUNT_EXPRESSION, {
            amount: 100,
            paid_amount: null,
          }),
        ).toBe(100);
      });

      it('falls back to amount when paid_amount is exactly zero', () => {
        // This is the case $ifNull would have gotten wrong: the entity declares
        // `default: 0`, so a 0 here means "never recorded", not "paid nothing".
        expect(
          evalSettled(SETTLED_AMOUNT_EXPRESSION, {
            amount: 100,
            paid_amount: 0,
          }),
        ).toBe(100);
      });
    });

    it('month and the equivalent from/to range agree for every status', async () => {
      const sampleDocs = [
        { due_date: '2026-08-01', payment_date: null },
        { due_date: '2026-08-31', payment_date: null },
        { due_date: null, payment_date: new Date('2026-08-01T03:00:00.000Z') },
        { due_date: null, payment_date: new Date('2026-08-31T23:00:00.000Z') },
        { due_date: '2026-08-10', payment_date: inAugust },
        { due_date: '2026-08-10', payment_date: inSeptember },
        { due_date: '2026-07-31', payment_date: null },
        { due_date: null, payment_date: new Date('2026-09-01T03:00:00.000Z') },
      ];

      for (const status of Object.values(SummaryStatus)) {
        await service.getSummary(1, { month: AUGUST, status });
        const monthMatch = lastMatchStage();
        const monthSum = lastSumExpression();

        await service.getSummary(1, { ...AUGUST_RANGE, status });
        const rangeMatch = lastMatchStage();

        expect(lastSumExpression()).toEqual(monthSum);
        for (const doc of sampleDocs) {
          expect({
            status,
            doc,
            included: docMatches(monthMatch, doc),
          }).toEqual({ status, doc, included: docMatches(rangeMatch, doc) });
        }
      }
    });
  });

  describe('getMonthlyTrend settled amounts', () => {
    it('sums the settled amount rather than the planned one', async () => {
      await service.getMonthlyTrend(1, 6);

      expect(lastSumExpression()).toEqual(SETTLED_AMOUNT_EXPRESSION);
    });

    it('still buckets only paid transactions, by payment_date', async () => {
      await service.getMonthlyTrend(1, 6);
      const match = lastMatchStage();

      expect(match.payment_date.$gte).toBeInstanceOf(Date);
      expect(match.payment_date.$lt).toBeInstanceOf(Date);
      expect(match.type).toEqual({ $in: ['EXPENSE', 'INCOME'] });
    });

    it('values a payment that settled below its planned amount at what was paid', async () => {
      await service.getMonthlyTrend(1, 6);

      expect(
        evalSettled(lastSumExpression(), { amount: 250, paid_amount: 200 }),
      ).toBe(200);
    });

    it('agrees with getSummary(status=paid) on how a month is valued and bounded', async () => {
      const month = '2026-08';

      await service.getSummary(1, { month, status: SummaryStatus.PAID });
      const summarySum = lastSumExpression();
      const summaryRange = lastMatchStage().payment_date;

      await service.getMonthlyTrend(1, 6);
      const trendSum = lastSumExpression();
      const trendBucket = lastGroupStage()._id;

      // Same valuation …
      expect(trendSum).toEqual(summarySum);

      // … and the same month boundary. getSummary bounds August via monthToRange
      // (APP_TIMEZONE); getMonthlyTrend buckets with $year/$month, which must be
      // given the same timezone or the two disagree for payments made near midnight
      // at the edges of a month.
      expect(trendBucket.year.$year.timezone).toBe(APP_TIMEZONE);
      expect(trendBucket.month.$month.timezone).toBe(APP_TIMEZONE);
      expect(summaryRange.$gte).toEqual(monthToRange(month).startDate);
    });
  });

  describe('getDailySummary', () => {
    const mockGroups = (
      rows: Array<{
        day: string;
        type: 'EXPENSE' | 'INCOME';
        total: number;
        count: number;
      }>,
    ) =>
      transactionRepository.aggregate.mockReturnValueOnce({
        toArray: async () =>
          rows.map(({ day, type, total, count }) => ({
            _id: { day, type },
            total,
            count,
          })),
      });

    it('pivots expenses and income into one entry per day, sorted by date', async () => {
      mockGroups([
        { day: '2026-03-12', type: 'EXPENSE', total: 30, count: 1 },
        { day: '2026-03-10', type: 'INCOME', total: 500, count: 1 },
        { day: '2026-03-10', type: 'EXPENSE', total: 100, count: 2 },
      ]);

      const result = await service.getDailySummary(
        USER_ID,
        '2026-03-01',
        '2026-03-31',
      );

      expect(result).toEqual([
        { date: '2026-03-10', expenses: 100, income: 500, count: 3 },
        { date: '2026-03-12', expenses: 30, income: 0, count: 1 },
      ]);
    });

    it('returns nothing for days without movement', async () => {
      const result = await service.getDailySummary(
        USER_ID,
        '2026-03-01',
        '2026-03-31',
      );

      expect(result).toEqual([]);
    });

    it('matches only the user’s paid income and expenses inside [from, to]', async () => {
      await service.getDailySummary(USER_ID, '2026-03-01', '2026-03-31');
      const match = lastMatchStage();

      expect(match.user_id).toBe(USER_ID);
      // type filter is what keeps transfers out; payment_date range keeps pending out
      expect(match.type).toEqual({ $in: ['EXPENSE', 'INCOME'] });
      expect(match.payment_date.$gte).toEqual(
        dayToRange('2026-03-01').startDate,
      );
      expect(match.payment_date.$lt).toEqual(dayToRange('2026-03-31').endDate);
    });

    it('values each payment at the settled amount, like getMonthlyTrend', async () => {
      await service.getDailySummary(USER_ID, '2026-03-01', '2026-03-31');

      expect(lastSumExpression()).toEqual(SETTLED_AMOUNT_EXPRESSION);
      expect(
        evalSettled(lastSumExpression(), { amount: 100, paid_amount: 80 }),
      ).toBe(80);
      expect(
        evalSettled(lastSumExpression(), { amount: 100, paid_amount: 0 }),
      ).toBe(100);
    });

    it('buckets days in APP_TIMEZONE, so a late-evening payment keeps its local day', async () => {
      await service.getDailySummary(USER_ID, '2026-03-01', '2026-03-31');

      const day = lastGroupStage()._id.day.$dateToString;
      expect(day.timezone).toBe(APP_TIMEZONE);
      expect(day.format).toBe('%Y-%m-%d');

      // 23:30 on the last day of a month, local time: already the next day in UTC,
      // but the day range that bounds the $match still treats it as the 31st.
      const { startDate, endDate } = dayToRange('2026-03-31');
      const latePayment = new Date(endDate.getTime() - 30 * 60 * 1000);
      expect(latePayment >= startDate && latePayment < endDate).toBe(true);
      expect(dayKeyOf(latePayment)).toBe('2026-03-31');
      expect(latePayment.toISOString().slice(0, 10)).not.toBe('2026-03-31');
    });

    it('accepts a full leap year (366 days)', async () => {
      await expect(
        service.getDailySummary(USER_ID, '2024-01-01', '2024-12-31'),
      ).resolves.toEqual([]);
    });

    it('accepts a single day', async () => {
      await expect(
        service.getDailySummary(USER_ID, '2026-03-10', '2026-03-10'),
      ).resolves.toEqual([]);
    });

    it.each([
      ['an interval longer than 366 days', '2026-01-01', '2027-02-04'],
      ['a reversed interval', '2026-06-01', '2026-01-01'],
      ['a day that does not exist', '2026-02-30', '2026-03-31'],
      ['a malformed date', 'abc', '2026-03-31'],
    ])('rejects %s with a 400', async (_label, from, to) => {
      await expect(
        service.getDailySummary(USER_ID, from, to),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionRepository.aggregate).not.toHaveBeenCalled();
    });
  });

  // status=pending and getForecastedExpenses answer the same question ("what is still
  // owed this month"), and now answer it the same way: both derive a half-open
  // due_date range from the month string and hand it to Mongo. due_date is stored as a
  // plain "YYYY-MM-DD" calendar date (see Transaction.due_date), so a string range is
  // the whole filter — no new Date() conversion, and therefore no timezone in which
  // the window could shift by a day.
  describe('status=pending vs getForecastedExpenses', () => {
    const MONTH = '2026-08';

    const pendingExpense = (dueDate: string | null, amount: number) => ({
      due_date: dueDate,
      payment_date: null,
      amount,
      type: 'EXPENSE',
      subcategory_id: null,
    });

    const candidates = () => [
      pendingExpense('2026-08-01', 100), // first day of the month
      pendingExpense('2026-08-31', 50), // last day of the month
      pendingExpense('2026-07-31', 70), // last day of the month before
      pendingExpense('2026-09-01', 30), // first day of the month after
      pendingExpense(null, 999), // unplanned — never pending
      { ...pendingExpense('2026-08-15', 400), payment_date: new Date() }, // paid
    ];

    /** The docs a $match would let through, in the order they were given. */
    const selectedBy = (match: Record<string, any>) =>
      candidates().filter((c) => docMatches(match, c));

    /**
     * Runs getForecastedExpenses with aggregate() evaluating the service's own $match
     * against `docs` and grouping the survivors, so totalPending is what Mongo would
     * return for the pipeline the service actually built rather than a hand-computed
     * number. Every candidate has subcategory_id null, so they group into one row.
     */
    const runForecast = async (month: string) => {
      transactionRepository.aggregate.mockImplementationOnce(
        (pipeline: Record<string, any>[]) => ({
          toArray: async () => {
            const match = pipeline.find((s) => '$match' in s)!.$match;
            const included = selectedBy(match);
            return included.length
              ? [
                  {
                    _id: null,
                    total: included.reduce((sum, c) => sum + c.amount, 0),
                    transactionCount: included.length,
                  },
                ]
              : [];
          },
        }),
      );
      return service.getForecastedExpenses(1, month);
    };

    it('status=pending selects exactly the transactions due in the month', async () => {
      await service.getSummary(1, {
        month: MONTH,
        status: SummaryStatus.PENDING,
      });
      const included = selectedBy(lastMatchStage());

      expect(included.map((c) => c.due_date)).toEqual([
        '2026-08-01',
        '2026-08-31',
      ]);
      expect(included.reduce((sum, c) => sum + c.amount, 0)).toBe(150);
    });

    it('getForecastedExpenses reports the same total as status=pending', async () => {
      const forecast = await runForecast(MONTH);

      expect(forecast.totalPending).toBe(150);
    });

    it('derives the same due_date bounds as status=pending for the same month', async () => {
      await runForecast(MONTH);
      const forecastRange = lastMatchStage().due_date;

      await service.getSummary(1, {
        month: MONTH,
        status: SummaryStatus.PENDING,
      });
      const pendingRange = lastMatchStage().due_date;

      // Structural agreement: both sides build the window from the same month string,
      // so they cannot drift apart the way two hand-rolled filters could.
      expect(forecastRange).toEqual(pendingRange);
      expect(forecastRange).toEqual({ $gte: '2026-08-01', $lt: '2026-09-01' });
    });

    describe('month boundaries', () => {
      const includes = async (dueDate: string) => {
        await runForecast(MONTH);
        return docMatches(lastMatchStage(), {
          due_date: dueDate,
          payment_date: null,
        });
      };

      it('includes an unpaid expense due on the first day of the month', async () => {
        expect(await includes('2026-08-01')).toBe(true);
      });

      it('includes an unpaid expense due on the last day of the month', async () => {
        expect(await includes('2026-08-31')).toBe(true);
      });

      it('excludes an unpaid expense due on the first day of the next month', async () => {
        expect(await includes('2026-09-01')).toBe(false);
      });

      it('excludes an unpaid expense due on the last day of the previous month', async () => {
        expect(await includes('2026-07-31')).toBe(false);
      });
    });

    it('excludes an already-paid expense and one with no due date', async () => {
      await runForecast(MONTH);
      const match = lastMatchStage();

      // Paid: due in the month, but payment_date is set.
      expect(
        docMatches(match, {
          due_date: '2026-08-15',
          payment_date: new Date('2026-08-15T12:00:00.000Z'),
        }),
      ).toBe(false);
      // Unplanned: nothing to be due.
      expect(docMatches(match, { due_date: null, payment_date: null })).toBe(
        false,
      );
      // Neither reaches the total.
      expect((await runForecast(MONTH)).totalPending).toBe(150);
    });
  });
});
