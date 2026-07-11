import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { MongoRepository, Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BudgetService } from '../budget/budget.service';
import { BankAccount } from 'src/bank-account/entities/bank-account.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Category } from 'src/category/entities/category.entity';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

const UNCATEGORIZED_LABEL = 'Sem categoria';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: MongoRepository<Transaction>,
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Subcategory)
    private subcategoryRepository: Repository<Subcategory>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private readonly budgetService: BudgetService,
  ) {}

  async create(createTransactionDto: CreateTransactionDto) {
    const account = await this.bankAccountRepository.findOne({
      where: { _id: toObjectId(createTransactionDto.account_id) } as any,
    });
    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    const amount = Number(createTransactionDto.amount || 0);
    if (!(amount > 0)) {
      throw new HttpException(
        'Amount must be a positive number',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createTransactionDto.subcategory_id) {
      const subcat = await this.subcategoryRepository.findOne({
        where: { _id: toObjectId(createTransactionDto.subcategory_id) } as any,
      });
      if (!subcat) {
        throw new HttpException('Subcategory not found', HttpStatus.NOT_FOUND);
      }
    }

    const t = (createTransactionDto.type || '').toLowerCase();
    const userId = (createTransactionDto as any).user_id || null;

    if (t === 'transfer') {
      const targetId = createTransactionDto.target_account_id;
      if (!targetId) {
        throw new HttpException(
          'Target account required for transfer',
          HttpStatus.BAD_REQUEST,
        );
      }

      const targetAccount = await this.bankAccountRepository.findOne({
        where: { _id: toObjectId(targetId) } as any,
      });
      if (!targetAccount) {
        throw new HttpException(
          'Target account not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // if (Number(account.balance) < amount) {
      //   throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
      // }

      const sourceTx = await this.transactionRepository.save({
        ...createTransactionDto,
        account_id: toObjectId(createTransactionDto.account_id),
        target_account_id: toObjectId(targetId),
        created_by: userId,
        updated_by: userId,
      } as any);

      await this.transactionRepository.save({
        ...createTransactionDto,
        account_id: toObjectId(targetId),
        target_account_id: toObjectId(createTransactionDto.account_id),
        type: 'transfer',
        created_by: userId,
        updated_by: userId,
      } as any);

      account.balance = Number(account.balance) - amount;
      targetAccount.balance = Number(targetAccount.balance) + amount;
      await this.bankAccountRepository.save(account);
      await this.bankAccountRepository.save(targetAccount);

      return sourceTx as TransactionResponseDto;
    }

    const payload = {
      ...(createTransactionDto as any),
      account_id: toObjectId(createTransactionDto.account_id),
      subcategory_id: createTransactionDto.subcategory_id
        ? toObjectId(createTransactionDto.subcategory_id)
        : undefined,
      target_account_id: createTransactionDto.target_account_id
        ? toObjectId(createTransactionDto.target_account_id)
        : undefined,
      created_by: userId,
      updated_by: userId,
    } as any;

    const saved = await this.transactionRepository.save(payload as any);

    // if (t === 'income') {
    //   account.balance = Number(account.balance) + amount;
    // } else if (t === 'expense') {
    //   account.balance = Number(account.balance) - amount;
    //   if (account.balance < 0) {
    //     throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
    //   }
    // }

    // await this.bankAccountRepository.save(account);

    await this.syncBudgetForTransaction(saved as Transaction);

    return saved as TransactionResponseDto;
  }

  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.transactionRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: [
        'name',
        'description',
        'type',
        'account_id',
        'subcategory_id',
      ],
      sortableFields: [
        'name',
        'amount',
        'due_date',
        'payment_date',
        'type',
        'created_at',
        'updated_at',
      ],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { user_id: userId },
    });
  }

  findOne(id: ObjectId) {
    return this.transactionRepository.findOne({ where: { _id: id } as any });
  }

  async getSummary(userId: number, month?: string) {
    const match: Record<string, unknown> = { user_id: userId };
    if (month) {
      const { startDate, endDate } = this.monthToRange(month);
      match.payment_date = { $gte: startDate, $lt: endDate };
    }

    const results = (await this.transactionRepository
      .aggregate([
        { $match: match },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ])
      .toArray()) as unknown as { _id: string; total: number }[];

    const totalExpenses = results.find((r) => r._id === 'EXPENSE')?.total ?? 0;
    const totalIncome = results.find((r) => r._id === 'INCOME')?.total ?? 0;

    return {
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
    };
  }

  /**
   * Spending broken down by category for a given month (default: current month).
   * Backs both the "expense distribution" and "spending by category" dashboard charts.
   */
  async getCategoryBreakdown(
    userId: number,
    month?: string,
  ): Promise<{
    month: string;
    categories: {
      categoryId: string;
      categoryName: string;
      total: number;
      transactionCount: number;
    }[];
  }> {
    const targetMonth = month || this.currentMonthString();
    const { startDate, endDate } = this.monthToRange(targetMonth);

    const results = (await this.transactionRepository
      .aggregate([
        {
          $match: {
            user_id: userId,
            type: 'EXPENSE',
            payment_date: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: '$subcategory_id',
            total: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
          },
        },
      ])
      .toArray()) as unknown as {
      _id: ObjectId | null;
      total: number;
      transactionCount: number;
    }[];

    return {
      month: targetMonth,
      categories: await this.resolveCategoryTotals(results),
    };
  }

  /**
   * Expenses due within the given month (default: current) that haven't been paid
   * yet — the "forecasted" spend still expected to happen this month, distinct from
   * getCategoryBreakdown which only counts money that has already moved.
   */
  async getForecastedExpenses(
    userId: number,
    month?: string,
  ): Promise<{
    month: string;
    totalPending: number;
    categories: {
      categoryId: string;
      categoryName: string;
      total: number;
      transactionCount: number;
    }[];
  }> {
    const targetMonth = month || this.currentMonthString();

    // due_date is populated straight from the create DTO's raw string (unlike
    // payment_date/created_at, which are always real Date objects set in code), so it's
    // stored inconsistently — a Mongo-level $gte/$lt range match against it silently
    // matches nothing on string-typed values. Fetch the candidate rows without a
    // due_date filter and bucket by month in application code instead.
    const pending = await this.transactionRepository.find({
      where: {
        user_id: userId,
        type: 'EXPENSE',
        payment_date: null,
      } as any,
    });

    const totalsBySubcategory = new Map<
      string,
      { total: number; transactionCount: number }
    >();
    for (const t of pending) {
      if (!t.due_date) continue;
      if (new Date(t.due_date).toISOString().slice(0, 7) !== targetMonth) {
        continue;
      }
      const key = t.subcategory_id ? t.subcategory_id.toString() : '';
      const existing = totalsBySubcategory.get(key) ?? {
        total: 0,
        transactionCount: 0,
      };
      existing.total += Number(t.amount);
      existing.transactionCount += 1;
      totalsBySubcategory.set(key, existing);
    }

    const rows = Array.from(totalsBySubcategory.entries()).map(([key, v]) => ({
      _id: key ? ObjectId.createFromHexString(key) : null,
      total: v.total,
      transactionCount: v.transactionCount,
    }));

    const categories = await this.resolveCategoryTotals(rows);
    const totalPending = categories.reduce((sum, c) => sum + c.total, 0);

    return { month: targetMonth, totalPending, categories };
  }

  /**
   * Resolves subcategory-grouped aggregate rows (from a $group on subcategory_id)
   * into category-level totals, re-hydrating ObjectIds via createFromHexString
   * before reusing them in another find() — same fix documented in
   * BudgetService.calculateSpent for this mongo driver.
   */
  private async resolveCategoryTotals(
    rows: { _id: ObjectId | null; total: number; transactionCount: number }[],
  ): Promise<
    {
      categoryId: string;
      categoryName: string;
      total: number;
      transactionCount: number;
    }[]
  > {
    const subcategoryIds = rows
      .filter((r) => r._id)
      .map((r) => ObjectId.createFromHexString(r._id!.toString()));

    const subcategories = subcategoryIds.length
      ? await this.subcategoryRepository.find({
          where: { _id: { $in: subcategoryIds } } as any,
        })
      : [];

    const categoryIds = Array.from(
      new Set(subcategories.map((s) => s.categoryId.toString())),
    ).map((id) => ObjectId.createFromHexString(id));

    const categories = categoryIds.length
      ? await this.categoryRepository.find({
          where: { _id: { $in: categoryIds } } as any,
        })
      : [];

    const categoryIdBySubcategory = new Map(
      subcategories.map((s) => [s.id.toString(), s.categoryId.toString()]),
    );
    const categoryNameById = new Map(
      categories.map((c) => [c.id.toString(), c.name]),
    );

    const totalsByCategory = new Map<
      string,
      { categoryName: string; total: number; transactionCount: number }
    >();

    for (const row of rows) {
      const subcategoryId = row._id?.toString();
      const categoryId = subcategoryId
        ? categoryIdBySubcategory.get(subcategoryId)
        : undefined;
      const key = categoryId ?? 'uncategorized';
      const categoryName = categoryId
        ? categoryNameById.get(categoryId) ?? UNCATEGORIZED_LABEL
        : UNCATEGORIZED_LABEL;

      const existing = totalsByCategory.get(key) ?? {
        categoryName,
        total: 0,
        transactionCount: 0,
      };
      existing.total += row.total;
      existing.transactionCount += row.transactionCount;
      totalsByCategory.set(key, existing);
    }

    return Array.from(totalsByCategory.entries()).map(([categoryId, v]) => ({
      categoryId,
      categoryName: v.categoryName,
      total: v.total,
      transactionCount: v.transactionCount,
    }));
  }

  /**
   * Income vs. expenses per month for the trailing `months` months (default 6),
   * bucketed by payment_date since that's when money actually moved.
   */
  async getMonthlyTrend(
    userId: number,
    months = 6,
  ): Promise<Array<{ month: string; income: number; expenses: number }>> {
    const monthKeys = this.lastNMonths(months);
    const { startDate } = this.monthToRange(monthKeys[0]);
    const now = new Date();

    const results = (await this.transactionRepository
      .aggregate([
        {
          $match: {
            user_id: userId,
            type: { $in: ['EXPENSE', 'INCOME'] },
            payment_date: { $gte: startDate, $lt: now },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$payment_date' },
              month: { $month: '$payment_date' },
              type: '$type',
            },
            total: { $sum: '$amount' },
          },
        },
      ])
      .toArray()) as unknown as {
      _id: { year: number; month: number; type: string };
      total: number;
    }[];

    return monthKeys.map((monthKey) => {
      const [year, monthNum] = monthKey.split('-').map(Number);
      const income =
        results.find(
          (r) =>
            r._id.year === year &&
            r._id.month === monthNum &&
            r._id.type === 'INCOME',
        )?.total ?? 0;
      const expenses =
        results.find(
          (r) =>
            r._id.year === year &&
            r._id.month === monthNum &&
            r._id.type === 'EXPENSE',
        )?.total ?? 0;
      return { month: monthKey, income, expenses };
    });
  }

  /**
   * Reconstructed total balance at the end of each of the trailing `months` months.
   * No historical balance snapshots exist, so this anchors to the current total
   * balance across all bank accounts and walks backwards subtracting each month's
   * net flow. Assumes balance only ever changes via payment() (true today).
   */
  async getBalanceEvolution(
    userId: number,
    months = 6,
  ): Promise<Array<{ month: string; balance: number }>> {
    const trend = await this.getMonthlyTrend(userId, months);
    const currentTotal = await this.getCurrentTotalBalance();

    const balances = new Array<number>(trend.length);
    let runningBalance = currentTotal;
    for (let i = trend.length - 1; i >= 0; i--) {
      balances[i] = runningBalance;
      runningBalance -= trend[i].income - trend[i].expenses;
    }

    return trend.map((t, i) => ({ month: t.month, balance: balances[i] }));
  }

  private async getCurrentTotalBalance(): Promise<number> {
    const accounts = await this.bankAccountRepository.find();
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }

  private currentMonthString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthToRange(month: string): { startDate: Date; endDate: Date } {
    const [year, monthNum] = month.split('-');
    const startDate = new Date(`${year}-${monthNum}-01T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    return { startDate, endDate };
  }

  private lastNMonths(n: number): string[] {
    const months: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }
    return months;
  }

  /**
   * Recalculate the budget (if any) that a transaction snapshot counts against, so
   * that BudgetService.spent stays in sync whenever a paid expense is created, edited,
   * paid, or removed. Uses UTC month bucketing to match BudgetService.calculateSpent's
   * date-range construction. Never throws — a sync failure must not fail the
   * transaction write that triggered it.
   */
  private async syncBudgetForTransaction(
    transaction: Pick<
      Transaction,
      'type' | 'subcategory_id' | 'payment_date' | 'user_id'
    > | null,
  ): Promise<void> {
    if (!transaction) return;
    if ((transaction.type || '').toUpperCase() !== 'EXPENSE') return;
    if (
      !transaction.subcategory_id ||
      !transaction.payment_date ||
      !transaction.user_id
    ) {
      return;
    }

    try {
      const subcategory = await this.subcategoryRepository.findOne({
        where: {
          _id: ObjectId.createFromHexString(
            transaction.subcategory_id.toString(),
          ),
        } as any,
      });
      if (!subcategory) return;

      const paymentDate = new Date(transaction.payment_date);
      const month = `${paymentDate.getUTCFullYear()}-${String(
        paymentDate.getUTCMonth() + 1,
      ).padStart(2, '0')}`;

      const budget = await this.budgetService.findByCategoryAndMonth(
        transaction.user_id,
        subcategory.categoryId,
        month,
      );
      if (budget) {
        await this.budgetService.updateSpent(budget.id);
      }
    } catch {
      // Best-effort sync — the transaction write already succeeded.
    }
  }

  async update(
    id: ObjectId,
    updateTransactionDto: UpdateTransactionDto,
    userId?: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    const before = { ...transaction };
    Object.assign(transaction, updateTransactionDto);
    // ObjectId-reference fields arrive as plain strings from the DTO (same as
    // create()) — assigning them raw would silently store a string instead of an
    // ObjectId, which breaks every $in/equality query matched against these fields
    // (e.g. BudgetService.calculateSpent).
    if (updateTransactionDto.subcategory_id !== undefined) {
      transaction.subcategory_id = toObjectId(updateTransactionDto.subcategory_id);
    }
    if (updateTransactionDto.account_id !== undefined) {
      transaction.account_id = toObjectId(updateTransactionDto.account_id);
    }
    if (updateTransactionDto.target_account_id !== undefined) {
      transaction.target_account_id = toObjectId(
        updateTransactionDto.target_account_id,
      );
    }
    if (userId) transaction.updated_by = userId;
    const saved = await this.transactionRepository.save(transaction);

    // Sync both the old and new budget in case the edit moved the transaction to a
    // different subcategory/category or payment month.
    await this.syncBudgetForTransaction(before);
    await this.syncBudgetForTransaction(saved);

    return saved;
  }

  async remove(id: ObjectId) {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { _id: id } as any,
      });
      const result = await this.transactionRepository.remove(transaction);
      await this.syncBudgetForTransaction(transaction);
      return result;
    } catch {
      return 'Não pode ser excluido ... pq eu nao sei mesmo...';
    }
  }

  async payment(
    id: ObjectId,
    paymentDto: PaymentTransactionDto,
    userId?: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Balance only moves when a transaction is actually paid/received, not at creation
    // (creation just registers a pending due amount). Guard against double-applying the
    // balance change if this transaction was already paid before.
    if (!transaction.payment_date) {
      const accountId = ObjectId.createFromHexString(
        transaction.account_id.toString(),
      );
      const account = await this.bankAccountRepository.findOne({
        where: { _id: accountId } as any,
      });
      if (account) {
        const amount = Number(paymentDto.paid_amount);
        const type = (transaction.type || '').toLowerCase();
        if (type === 'income') {
          account.balance = Number(account.balance) + amount;
        } else if (type === 'expense') {
          account.balance = Number(account.balance) - amount;
        }
        await this.bankAccountRepository.save(account);
      }
    }

    transaction.payment_date = paymentDto.payment_date || new Date();
    transaction.paid_amount = paymentDto.paid_amount;
    if (userId) transaction.updated_by = userId;

    const saved = await this.transactionRepository.save(transaction);
    await this.syncBudgetForTransaction(saved);
    return saved;
  }
}
