import {
  Injectable,
  HttpException,
  HttpStatus,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { DataSource, MongoRepository, Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BudgetService } from '../budget/budget.service';
import { BankAccount } from 'src/bank-account/entities/bank-account.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Category } from 'src/category/entities/category.entity';
import { ClientSession, MongoClient, ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';
import {
  APP_TIMEZONE,
  currentMonthString,
  dayToRange,
  lastNMonths,
  monthKeyOf,
  monthToRange,
  shiftMonth,
} from '../common/date/month-range.util';
import { SummaryStatus } from './summary-status.enum';

const UNCATEGORIZED_LABEL = 'Sem categoria';

/**
 * What a transaction is worth in any figure that reports money already moved:
 * the amount it was actually paid for, falling back to the planned amount when
 * no paid amount was recorded.
 *
 * `$ifNull: ['$paid_amount', '$amount']` is NOT enough here. It recovers absent
 * and null, but not a literal 0 — and paid_amount is declared `default: 0` on the
 * entity while CreateTransactionDto leaves it optional even when payment_date is
 * set, so a transaction can be created already-paid with paid_amount absent, null,
 * or 0. `$gt: 0` treats all three uniformly as "nothing was recorded". Amounts are
 * @IsPositive at creation, so this can never reject a legitimately recorded value.
 *
 * Shared by getSummary's PAID branch and getMonthlyTrend so the dashboard's cards
 * and its charts cannot value the same payment differently.
 */
const SETTLED_AMOUNT = {
  $cond: [{ $gt: ['$paid_amount', 0] }, '$paid_amount', '$amount'],
};

const DAY_MS = 24 * 60 * 60 * 1000;
// A full leap year, so the front can ask for Jan 1 – Dec 31 of any year.
const MAX_DAILY_SUMMARY_DAYS = 366;

// due_date is typed as Date on the DTO but arrives as a plain string at runtime
// (validated via @IsDateString()), so this accepts either representation.
function hasDueDate(dueDate: unknown): boolean {
  return !!dueDate && dueDate !== '';
}

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs `work` inside a native MongoDB driver session/transaction. TypeORM's
   * query runner does NOT implement real transactions for its MongoDB driver
   * (startTransaction/commitTransaction/rollbackTransaction are no-ops there),
   * so this goes around it exactly like GroupExpenseService.create() does:
   * pull the native MongoClient off the driver, open a session, and drive
   * writes through `dataSource.mongoManager`, which forwards `{ session }`
   * straight to the native collection calls. `.save()` does not accept a
   * session and must not be used inside `work`.
   */
  private async withSession(
    work: (session: ClientSession) => Promise<void>,
  ): Promise<void> {
    // TypeORM ships its own duplicated mongodb typings that structurally
    // conflict with the real `mongodb` package's ClientSession type — the
    // `as any` here is a typing workaround, not a runtime risk (see
    // GroupExpenseService.create for precedent).
    const client = (this.dataSource.driver as any).queryRunner
      .databaseConnection as MongoClient;
    const session = client.startSession();
    try {
      await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  /**
   * The signed balance effect a transaction has on its linked account: zero
   * while unpaid, +paid_amount for income, -paid_amount for expense. Transfers
   * are not expressed through this — their movement is unconditional at
   * creation and reconciled separately (see removeTransfer).
   */
  private balanceEffect(
    tx: Pick<Transaction, 'type' | 'payment_date' | 'paid_amount'>,
  ): number {
    if (!tx.payment_date) return 0;
    const amount = Number(tx.paid_amount || 0);
    const type = (tx.type || '').toLowerCase();
    if (type === 'income') return amount;
    if (type === 'expense') return -amount;
    return 0;
  }

  private async applyBalanceDelta(
    accountId: ObjectId,
    delta: number,
    session: ClientSession,
  ): Promise<void> {
    if (delta === 0) return;
    await this.dataSource.mongoManager.updateOne(
      BankAccount,
      { _id: accountId },
      { $inc: { balance: delta } },
      { session } as any,
    );
  }

  async create(createTransactionDto: CreateTransactionDto, userId: number) {
    const account = await this.bankAccountRepository.findOne({
      where: {
        _id: toObjectId(createTransactionDto.account_id),
        user_id: userId,
      } as any,
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
      // Own subcategories and the shared system catalogue (user_id null) are usable.
      if (!subcat || (subcat.user_id != null && subcat.user_id !== userId)) {
        throw new HttpException('Subcategory not found', HttpStatus.NOT_FOUND);
      }
    }

    const t = (createTransactionDto.type || '').toLowerCase();
    const isPlanned = hasDueDate(createTransactionDto.due_date);
    const subcategoryId = createTransactionDto.subcategory_id
      ? toObjectId(createTransactionDto.subcategory_id)
      : undefined;
    const now = new Date();

    if (t === 'transfer') {
      const targetId = createTransactionDto.target_account_id;
      if (!targetId) {
        throw new HttpException(
          'Target account required for transfer',
          HttpStatus.BAD_REQUEST,
        );
      }

      const targetAccount = await this.bankAccountRepository.findOne({
        where: { _id: toObjectId(targetId), user_id: userId } as any,
      });
      if (!targetAccount) {
        throw new HttpException(
          'Target account not found',
          HttpStatus.NOT_FOUND,
        );
      }

      const transferGroupId = new ObjectId();
      const sourceId = new ObjectId();
      const mirrorId = new ObjectId();

      const sourceDoc = {
        ...createTransactionDto,
        _id: sourceId,
        account_id: toObjectId(createTransactionDto.account_id),
        target_account_id: toObjectId(targetId),
        subcategory_id: subcategoryId,
        is_planned: isPlanned,
        transfer_group_id: transferGroupId,
        is_transfer_mirror: false,
        user_id: userId,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      };
      const mirrorDoc = {
        ...createTransactionDto,
        _id: mirrorId,
        account_id: toObjectId(targetId),
        target_account_id: toObjectId(createTransactionDto.account_id),
        subcategory_id: subcategoryId,
        type: 'transfer',
        is_planned: isPlanned,
        transfer_group_id: transferGroupId,
        is_transfer_mirror: true,
        user_id: userId,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      };

      await this.withSession(async (session) => {
        await this.dataSource.mongoManager.insertMany(
          Transaction,
          [sourceDoc, mirrorDoc] as any,
          { session } as any,
        );
        await this.applyBalanceDelta(account.id, -amount, session);
        await this.applyBalanceDelta(targetAccount.id, amount, session);
      });

      const saved = await this.transactionRepository.findOne({
        where: { _id: sourceId } as any,
      });
      return saved as unknown as TransactionResponseDto;
    }

    const newId = new ObjectId();
    const payload = {
      ...createTransactionDto,
      _id: newId,
      account_id: toObjectId(createTransactionDto.account_id),
      subcategory_id: subcategoryId,
      target_account_id: createTransactionDto.target_account_id
        ? toObjectId(createTransactionDto.target_account_id)
        : undefined,
      is_planned: isPlanned,
      user_id: userId,
      created_by: userId,
      updated_by: userId,
      created_at: now,
      updated_at: now,
    };

    const effect = this.balanceEffect(payload as any);

    await this.withSession(async (session) => {
      await this.dataSource.mongoManager.insertOne(
        Transaction,
        payload as any,
        { session } as any,
      );
      await this.applyBalanceDelta(account.id, effect, session);
    });

    const saved = await this.transactionRepository.findOne({
      where: { _id: newId } as any,
    });

    await this.syncBudgetForTransaction(saved as Transaction);

    return saved as unknown as TransactionResponseDto;
  }

  async findAll(
    userId: number,
    query: FindAllQueryDto,
    dateRange?: { from?: string; to?: string; category_id?: string },
  ) {
    const baseWhere: Record<string, any> = { user_id: userId };
    // An unplanned transaction (see hasDueDate()) has no due_date at all, so a range
    // match on due_date alone silently drops every unplanned-but-paid transaction from
    // a date-filtered list. Matching due_date OR payment_date covers both: planned
    // transactions by when they're due, unplanned ones by when they were actually paid.
    // due_date stays a string range (it's always stored as plain "YYYY-MM-DD"); payment_date
    // is a real Date, so its range comes from dayToRange's UTC day boundaries instead.
    if (dateRange?.from || dateRange?.to) {
      const dueDateRange: Record<string, string> = {
        ...(dateRange.from && { $gte: dateRange.from }),
        ...(dateRange.to && { $lte: dateRange.to }),
      };
      const paymentDateRange: Record<string, Date> = {
        ...(dateRange.from && { $gte: dayToRange(dateRange.from).startDate }),
        ...(dateRange.to && { $lt: dayToRange(dateRange.to).endDate }),
      };

      baseWhere.$or = [
        { due_date: dueDateRange },
        { payment_date: paymentDateRange },
      ];
    }

    // Only resolve category_id → subcategory_id list when the caller hasn't already
    // narrowed to one specific subcategory via the generic filters[] mechanism.
    if (dateRange?.category_id && !query.filters?.subcategory_id) {
      baseWhere.subcategory_id = {
        $in: await this.resolveSubcategoryIdsForCategory(dateRange.category_id),
      };
    }

    return paginate(this.transactionRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: [
        'name',
        'description',
        'type',
        'account_id',
        'subcategory_id',
        'is_planned',
      ],
      sortableFields: [
        'name',
        'amount',
        'due_date',
        'payment_date',
        'type',
        'is_planned',
        'created_at',
        'updated_at',
      ],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere,
      preQueryStages: [
        {
          $set: {
            // $ne against a genuinely absent field evaluates to true in this MongoDB
            // version (missing is NOT treated as equal to null here), so the previous
            // { $ne: [$due_date, null] } form misclassified any document that never
            // had due_date set (e.g. a raw insertOne where an undefined value was
            // stripped) as planned. $ifNull + $strLenCP treats missing, null, and ''
            // uniformly as "no due date" — matching hasDueDate()'s own JS logic.
            is_planned: {
              $gt: [{ $strLenCP: { $ifNull: ['$due_date', ''] } }, 0],
            },
          },
        },
      ],
    });
  }

  async findOne(id: ObjectId, userId: number) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id, user_id: userId } as any,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async getSummary(
    userId: number,
    params?: {
      month?: string;
      from?: string;
      to?: string;
      type?: string;
      account_id?: string;
      category_id?: string;
      subcategory_id?: string;
      status?: SummaryStatus;
    },
  ) {
    const status = params?.status ?? SummaryStatus.ALL;
    const match: Record<string, unknown> = { user_id: userId };

    if (params?.from || params?.to) {
      // Matches due_date OR payment_date, same as findAll — a period match on
      // due_date alone would silently drop every unplanned-but-paid transaction,
      // and payment_date alone would drop every planned-but-unpaid one.
      const dueDateRange: Record<string, string> = {
        ...(params.from && { $gte: params.from }),
        ...(params.to && { $lte: params.to }),
      };
      const paymentDateRange: Record<string, Date> = {
        ...(params.from && { $gte: dayToRange(params.from).startDate }),
        ...(params.to && { $lt: dayToRange(params.to).endDate }),
      };
      Object.assign(
        match,
        this.periodMatchForStatus(dueDateRange, paymentDateRange, status),
      );
    } else if (params?.month) {
      // Translated to the same half-open shape as the from/to branch above ([month-01,
      // next-month-01) on due_date, [startDate, endDate) on payment_date) so month=X and
      // the equivalent from/to=X can never drift apart the way they did before this fix.
      const { startDate, endDate } = monthToRange(params.month);
      const dueDateRange = {
        $gte: `${params.month}-01`,
        $lt: `${shiftMonth(params.month, 1)}-01`,
      };
      const paymentDateRange = { $gte: startDate, $lt: endDate };
      Object.assign(
        match,
        this.periodMatchForStatus(dueDateRange, paymentDateRange, status),
      );
    }

    if (params?.type) {
      match.type = params.type.toUpperCase();
    }
    if (params?.account_id) {
      match.account_id = ObjectId.createFromHexString(params.account_id);
    }
    if (params?.subcategory_id) {
      match.subcategory_id = ObjectId.createFromHexString(
        params.subcategory_id,
      );
    } else if (params?.category_id) {
      match.subcategory_id = {
        $in: await this.resolveSubcategoryIdsForCategory(params.category_id),
      };
    }

    // Only the PAID totals describe money that actually moved, so only they are
    // valued at the settled amount; ALL and PENDING are forecasts and stay on the
    // planned amount.
    const amountExpression =
      status === SummaryStatus.PAID ? SETTLED_AMOUNT : '$amount';

    const results = (await this.transactionRepository
      .aggregate([
        { $match: match },
        { $group: { _id: '$type', total: { $sum: amountExpression } } },
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
    const targetMonth = month || currentMonthString();
    const { startDate, endDate } = monthToRange(targetMonth);

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
    const targetMonth = month || currentMonthString();

    // The same half-open due_date bounds getSummary derives for a month (see its
    // `month` branch and periodMatchForStatus's PENDING case), built from the same
    // month string — that is what makes "the forecast agrees with the pending summary"
    // structurally true rather than a coincidence of two hand-rolled filters.
    // `payment_date: null` matches both an explicit null and an absent field.
    const rows = (await this.transactionRepository
      .aggregate([
        {
          $match: {
            user_id: userId,
            type: 'EXPENSE',
            payment_date: null,
            due_date: {
              $gte: `${targetMonth}-01`,
              $lt: `${shiftMonth(targetMonth, 1)}-01`,
            },
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
    const monthKeys = lastNMonths(months);
    const { startDate } = monthToRange(monthKeys[0]);
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
              // $year/$month default to UTC, which bucketed a payment made late on
              // the last day of a month in APP_TIMEZONE into the *next* month —
              // disagreeing with getSummary, whose bounds come from monthToRange.
              // Same class of off-by-one that monthToRange exists to prevent.
              year: {
                $year: { date: '$payment_date', timezone: APP_TIMEZONE },
              },
              month: {
                $month: { date: '$payment_date', timezone: APP_TIMEZONE },
              },
              type: '$type',
            },
            // Settled amount, not planned: this series only ever contains paid
            // transactions, and the account balance it is reconciled against is
            // itself derived from paid_amount (see balanceEffect).
            total: { $sum: SETTLED_AMOUNT },
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
   * Paid income/expenses per calendar day in [from, to] (both `YYYY-MM-DD`,
   * inclusive), bucketed by payment_date in APP_TIMEZONE and valued at the settled
   * amount — the same rules as getMonthlyTrend, so a day-level view never disagrees
   * with the monthly one. Days without movement are omitted; transfers are excluded
   * by the type filter.
   */
  async getDailySummary(
    userId: number,
    from: string,
    to: string,
  ): Promise<
    Array<{ date: string; expenses: number; income: number; count: number }>
  > {
    const { startDate } = dayToRange(from);
    const { endDate } = dayToRange(to);

    if (startDate >= endDate) {
      throw new BadRequestException('"from" must not be after "to".');
    }
    const days = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
    if (days > MAX_DAILY_SUMMARY_DAYS) {
      throw new BadRequestException(
        `Interval too long: at most ${MAX_DAILY_SUMMARY_DAYS} days.`,
      );
    }

    const results = (await this.transactionRepository
      .aggregate([
        {
          $match: {
            user_id: userId,
            type: { $in: ['EXPENSE', 'INCOME'] },
            payment_date: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: {
              // Without an explicit timezone Mongo buckets in UTC, which moves a
              // payment made late in the evening to the next day (see getMonthlyTrend).
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$payment_date',
                  timezone: APP_TIMEZONE,
                },
              },
              type: '$type',
            },
            total: { $sum: SETTLED_AMOUNT },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray()) as unknown as {
      _id: { day: string; type: string };
      total: number;
      count: number;
    }[];

    const byDay = new Map<
      string,
      { date: string; expenses: number; income: number; count: number }
    >();
    for (const { _id, total, count } of results) {
      const entry = byDay.get(_id.day) ?? {
        date: _id.day,
        expenses: 0,
        income: 0,
        count: 0,
      };
      if (_id.type === 'INCOME') entry.income += total;
      else entry.expenses += total;
      entry.count += count;
      byDay.set(_id.day, entry);
    }

    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
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
    const currentTotal = await this.getCurrentTotalBalance(userId);

    const balances = new Array<number>(trend.length);
    let runningBalance = currentTotal;
    for (let i = trend.length - 1; i >= 0; i--) {
      balances[i] = runningBalance;
      runningBalance -= trend[i].income - trend[i].expenses;
    }

    return trend.map((t, i) => ({ month: t.month, balance: balances[i] }));
  }

  async getPlannedVsUnplanned(
    userId: number,
    month?: string,
  ): Promise<{
    month: string;
    planned: { total: number; count: number };
    unplanned: { total: number; count: number };
  }> {
    const targetMonth = month || currentMonthString();
    const { startDate, endDate } = monthToRange(targetMonth);

    const results = (await this.transactionRepository
      .aggregate([
        {
          $set: {
            // $ne against a genuinely absent field evaluates to true in this MongoDB
            // version (missing is NOT treated as equal to null here), so the previous
            // { $ne: [$due_date, null] } form misclassified any document that never
            // had due_date set (e.g. a raw insertOne where an undefined value was
            // stripped) as planned. $ifNull + $strLenCP treats missing, null, and ''
            // uniformly as "no due date" — matching hasDueDate()'s own JS logic.
            is_planned: {
              $gt: [{ $strLenCP: { $ifNull: ['$due_date', ''] } }, 0],
            },
          },
        },
        {
          $match: {
            user_id: userId,
            type: 'EXPENSE',
            payment_date: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: '$is_planned',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray()) as unknown as {
      _id: boolean;
      total: number;
      count: number;
    }[];

    const planned = results.find((r) => r._id === true) ?? {
      total: 0,
      count: 0,
    };
    const unplanned = results.find((r) => r._id === false) ?? {
      total: 0,
      count: 0,
    };

    return {
      month: targetMonth,
      planned: { total: planned.total, count: planned.count },
      unplanned: { total: unplanned.total, count: unplanned.count },
    };
  }

  private async getCurrentTotalBalance(userId: number): Promise<number> {
    const accounts = await this.bankAccountRepository.find({
      where: { user_id: userId } as any,
    });
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }

  private async resolveSubcategoryIdsForCategory(
    categoryId: string,
  ): Promise<ObjectId[]> {
    const subcategories = await this.subcategoryRepository.find({
      where: { categoryId: toObjectId(categoryId) } as any,
    });
    return subcategories.map((s) => s.id);
  }

  /**
   * `$or: [{due_date...}, {payment_date...}]` covering a period — mirrors findAll's
   * "planned transactions by when they're due, unplanned ones by when they were
   * actually paid" logic (see findAll's dueDateRange/paymentDateRange comment) so
   * getSummary can no longer diverge from what the transaction list shows.
   */
  private periodMatch(
    dueDateRange: Record<string, string>,
    paymentDateRange: Record<string, Date>,
  ): Record<string, unknown> {
    return {
      $or: [{ due_date: dueDateRange }, { payment_date: paymentDateRange }],
    };
  }

  /**
   * The period `$match` for a given SummaryStatus. Both getSummary branches (month
   * and from/to) compute the same two ranges and hand them here, so a status can
   * never mean one thing for `month` and another for the equivalent `from`/`to`.
   *
   * PENDING needs no `$or`: an unpaid transaction has no payment_date to match on,
   * so the ALL disjunction would collapse to its due_date arm anyway. `payment_date: null`
   * matches both an explicit null and an absent field, which is what "not yet paid" means.
   */
  private periodMatchForStatus(
    dueDateRange: Record<string, string>,
    paymentDateRange: Record<string, Date>,
    status: SummaryStatus,
  ): Record<string, unknown> {
    switch (status) {
      case SummaryStatus.PAID:
        return { payment_date: paymentDateRange };
      case SummaryStatus.PENDING:
        return { due_date: dueDateRange, payment_date: null };
      case SummaryStatus.ALL:
      default:
        return this.periodMatch(dueDateRange, paymentDateRange);
    }
  }

  /**
   * Recalculate the budget (if any) that a transaction snapshot counts against, so
   * that BudgetService.spent stays in sync whenever a paid expense is created, edited,
   * paid, or removed. Buckets by month in APP_TIMEZONE to match the range
   * BudgetService.calculateSpent builds from the same helper. Never throws — a sync
   * failure must not fail the transaction write that triggered it. Deliberately runs
   * outside the write's session: it reads other collections and calls webhooks, and
   * failing a user's edit because a webhook timed out would be worse than a stale
   * budget total.
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

      const month = monthKeyOf(new Date(transaction.payment_date));

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
    userId: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id, user_id: userId } as any,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const isTransfer = (transaction.type || '').toLowerCase() === 'transfer';
    if (
      isTransfer &&
      (updateTransactionDto.amount !== undefined ||
        updateTransactionDto.account_id !== undefined ||
        updateTransactionDto.target_account_id !== undefined)
    ) {
      throw new BadRequestException(
        "Editing a transfer's amount or accounts is not supported; delete and recreate it instead.",
      );
    }

    // Re-pointing a transaction must not reach another user's account or subcategory.
    for (const accountId of [
      updateTransactionDto.account_id,
      updateTransactionDto.target_account_id,
    ]) {
      if (!accountId) continue;
      const owned = await this.bankAccountRepository.findOne({
        where: { _id: toObjectId(accountId), user_id: userId } as any,
      });
      if (!owned) {
        throw new NotFoundException('Account not found');
      }
    }
    if (updateTransactionDto.subcategory_id) {
      const subcat = await this.subcategoryRepository.findOne({
        where: { _id: toObjectId(updateTransactionDto.subcategory_id) } as any,
      });
      if (!subcat || (subcat.user_id != null && subcat.user_id !== userId)) {
        throw new NotFoundException('Subcategory not found');
      }
    }

    const before = { ...transaction };
    const originalIsPlanned = transaction.is_planned;
    Object.assign(transaction, updateTransactionDto);
    transaction.is_planned = originalIsPlanned;
    // ObjectId-reference fields arrive as plain strings from the DTO (same as
    // create()) — assigning them raw would silently store a string instead of an
    // ObjectId, which breaks every $in/equality query matched against these fields
    // (e.g. BudgetService.calculateSpent). A field cleared to "" is normalized to
    // undefined by the DTO's @Transform and is handled below by the $set sanitizer.
    if (updateTransactionDto.subcategory_id) {
      transaction.subcategory_id = toObjectId(
        updateTransactionDto.subcategory_id,
      );
    }
    if (!isTransfer && updateTransactionDto.account_id !== undefined) {
      transaction.account_id = toObjectId(updateTransactionDto.account_id);
    }
    if (!isTransfer && updateTransactionDto.target_account_id) {
      transaction.target_account_id = toObjectId(
        updateTransactionDto.target_account_id,
      );
    }
    transaction.updated_by = userId;
    transaction.updated_at = new Date();

    const beforeEffect = this.balanceEffect(before);
    const afterEffect = isTransfer ? 0 : this.balanceEffect(transaction);

    // Raw $set bypasses TypeORM's own undefined-handling, so any field explicitly
    // cleared by the caller (e.g. due_date: "" → undefined via the DTO transform)
    // is normalized to null here — sending `undefined` through the native driver
    // is ambiguous (BSON has a deprecated "undefined" type) and must be avoided.
    const rest = {
      ...(transaction as unknown as Record<string, unknown>),
    };
    delete rest.id;
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      setFields[key] = value === undefined ? null : value;
    }

    await this.withSession(async (session) => {
      await this.dataSource.mongoManager.updateOne(
        Transaction,
        { _id: id },
        { $set: setFields },
        { session } as any,
      );
      if (before.account_id) {
        await this.applyBalanceDelta(
          toObjectId(before.account_id.toString()),
          -beforeEffect,
          session,
        );
      }
      if (afterEffect !== 0 && transaction.account_id) {
        await this.applyBalanceDelta(
          toObjectId(transaction.account_id.toString()),
          afterEffect,
          session,
        );
      }
    });

    const saved = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });

    // Sync both the old and new budget in case the edit moved the transaction to a
    // different subcategory/category or payment month.
    await this.syncBudgetForTransaction(before);
    await this.syncBudgetForTransaction(saved);

    return saved;
  }

  async remove(id: ObjectId, userId: number) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id, user_id: userId } as any,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const isTransfer = (transaction.type || '').toLowerCase() === 'transfer';

    if (isTransfer) {
      await this.removeTransfer(transaction, userId);
    } else {
      const effect = this.balanceEffect(transaction);
      await this.withSession(async (session) => {
        await this.dataSource.mongoManager.deleteOne(Transaction, { _id: id }, {
          session,
        } as any);
        if (transaction.account_id) {
          await this.applyBalanceDelta(
            toObjectId(transaction.account_id.toString()),
            -effect,
            session,
          );
        }
      });
    }

    await this.syncBudgetForTransaction(transaction);
    return { deleted: true };
  }

  /**
   * A transfer's balance movement is applied once at creation (source debited,
   * target credited) and described by two documents, not two independent
   * effects — see design.md. The authoritative (non-mirror) leg's own
   * account_id/target_account_id encode that movement's direction; the mirror
   * leg carries none of its own. Legacy transfers predate `is_transfer_mirror`
   * and `transfer_group_id`, so every leg of one looks "authoritative" in
   * isolation — reversing with whichever leg is being deleted is the best
   * available answer when no sibling can be found, rather than failing the
   * request or guessing at a pairing.
   */
  private async removeTransfer(
    transaction: Transaction,
    userId: number,
  ): Promise<void> {
    let sibling: Transaction | null = null;
    if (transaction.transfer_group_id) {
      sibling = await this.transactionRepository.findOne({
        where: {
          transfer_group_id: toObjectId(
            transaction.transfer_group_id.toString(),
          ),
          _id: { $ne: transaction.id },
          user_id: userId,
        } as any,
      });
    }

    const authoritative = !transaction.is_transfer_mirror
      ? transaction
      : sibling ?? transaction;

    await this.withSession(async (session) => {
      await this.dataSource.mongoManager.deleteOne(
        Transaction,
        { _id: transaction.id },
        { session } as any,
      );
      if (sibling) {
        await this.dataSource.mongoManager.deleteOne(
          Transaction,
          { _id: sibling.id },
          { session } as any,
        );
      }
      const amount = Number(authoritative.amount || 0);
      if (authoritative.account_id) {
        await this.applyBalanceDelta(
          toObjectId(authoritative.account_id.toString()),
          -amount,
          session,
        );
      }
      if (authoritative.target_account_id) {
        await this.applyBalanceDelta(
          toObjectId(authoritative.target_account_id.toString()),
          amount,
          session,
        );
      }
    });
  }

  async payment(
    id: ObjectId,
    paymentDto: PaymentTransactionDto,
    userId: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id, user_id: userId } as any,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Guard against re-paying a transaction that was already paid before -
    // both the balance mutation and the record update must be skipped, not just the balance.
    if (transaction.payment_date) {
      throw new ConflictException('Transaction is already paid');
    }

    const paymentDate = paymentDto.payment_date || new Date();
    const paidAmount = paymentDto.paid_amount;
    const effect = this.balanceEffect({
      type: transaction.type,
      payment_date: paymentDate,
      paid_amount: paidAmount,
    });

    await this.withSession(async (session) => {
      await this.dataSource.mongoManager.updateOne(
        Transaction,
        { _id: id },
        {
          $set: {
            payment_date: paymentDate,
            paid_amount: paidAmount,
            updated_by: userId,
            updated_at: new Date(),
          },
        },
        { session } as any,
      );
      if (transaction.account_id) {
        await this.applyBalanceDelta(
          toObjectId(transaction.account_id.toString()),
          effect,
          session,
        );
      }
    });

    const saved = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });
    await this.syncBudgetForTransaction(saved);
    return saved;
  }
}
