import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MongoRepository, Between } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Budget, RolloverPolicy } from './entities/budget.entity';
import { BudgetAlert, AlertLevel } from './entities/budget-alert.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { WebhookService } from '../webhook/webhook.service';
import { WebhookEventType } from '../webhook/entities/webhook-subscription.entity';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(Budget)
    private budgetRepository: MongoRepository<Budget>,
    @InjectRepository(BudgetAlert)
    private budgetAlertRepository: Repository<BudgetAlert>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Subcategory)
    private subcategoryRepository: Repository<Subcategory>,
    private webhookService: WebhookService,
  ) {}

  /**
   * Create a new budget for a user/category/month
   */
  async create(
    userId: number,
    createBudgetDto: CreateBudgetDto,
  ): Promise<Budget> {
    const budget = this.budgetRepository.create({
      userId,
      categoryId: toObjectId(createBudgetDto.categoryId),
      month: createBudgetDto.month,
      amount: createBudgetDto.amount,
      rolloverPolicy:
        createBudgetDto.rolloverPolicy || RolloverPolicy.NO_ROLLOVER,
      spent: 0,
      created_by: userId,
    });
    return this.budgetRepository.save(budget);
  }

  /**
   * Find all budgets for a user, paginated/searchable/sortable/filterable
   */
  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.budgetRepository, query, {
      filterableFields: ['month', 'categoryId', 'rolloverPolicy'],
      sortableFields: ['month', 'amount', 'spent', 'created_at', 'updated_at'],
      defaultSort: { key: 'month', direction: 'desc' },
      baseWhere: { userId },
    });
  }

  /**
   * Find all budgets for a specific user and month
   */
  async findByMonth(userId: number, month: string): Promise<Budget[]> {
    return this.budgetRepository.find({
      where: { userId, month },
    });
  }

  /**
   * Find all budgets for a user in a date range
   */
  async findByDateRange(
    userId: number,
    startMonth: string,
    endMonth: string,
  ): Promise<Budget[]> {
    return this.budgetRepository.find({
      where: { userId, month: Between(startMonth, endMonth) },
      order: { month: 'DESC' },
    });
  }

  /**
   * Find budget by ID and verify ownership
   */
  async findOne(id: ObjectId, userId: number): Promise<Budget | null> {
    const budget = await this.budgetRepository.findOne({
      where: { _id: id } as any,
    });

    if (budget && budget.userId === userId) {
      return budget;
    }
    return null;
  }

  /**
   * Update budget details (amount, rollover policy)
   */
  async update(
    id: ObjectId,
    userId: number,
    updateBudgetDto: UpdateBudgetDto,
  ): Promise<Budget> {
    const budget = await this.findOne(id, userId);
    if (!budget) {
      throw new Error('Budget not found');
    }

    if (updateBudgetDto.amount !== undefined) {
      budget.amount = updateBudgetDto.amount;
    }
    if (updateBudgetDto.rolloverPolicy !== undefined) {
      budget.rolloverPolicy = updateBudgetDto.rolloverPolicy;
    }

    budget.updated_by = userId;
    budget.updated_at = new Date();

    return this.budgetRepository.save(budget);
  }

  /**
   * Delete budget
   */
  async delete(id: ObjectId, userId: number): Promise<void> {
    const budget = await this.findOne(id, userId);
    if (!budget) {
      throw new Error('Budget not found');
    }
    // Delete associated alerts first
    await this.budgetAlertRepository.delete({ budgetId: id });
    // Delete budget
    await this.budgetRepository.delete(id);
  }

  /**
   * Calculate spent amount for a budget based on expenses in that category/month
   */
  async calculateSpent(budgetId: ObjectId): Promise<number> {
    const budget = await this.budgetRepository.findOne({
      where: { _id: budgetId } as any,
    });
    if (!budget) {
      return 0;
    }

    // A budget scopes a whole category, but transactions link to a subcategory —
    // resolve every subcategory under this budget's category before matching transactions.
    // Re-hydrating an ObjectId fetched via TypeORM and reusing it directly in another
    // find() does not match reliably against the mongodb driver — round-trip through
    // ObjectId.createFromHexString() first (same fix already applied in paginate.util.ts).
    const categoryId = ObjectId.createFromHexString(
      budget.categoryId.toString(),
    );
    const subcategories = await this.subcategoryRepository.find({
      where: { categoryId } as any,
    });
    if (subcategories.length === 0) {
      return 0;
    }
    const subcategoryIds = subcategories.map((s) =>
      ObjectId.createFromHexString(s.id.toString()),
    );

    // Parse month string YYYY-MM to get start and end dates
    const [year, month] = budget.month.split('-');
    const startDate = new Date(`${year}-${month}-01T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Sum all expense transactions for this category's subcategories in this month.
    // TypeORM's In() operator does not match ObjectId values against the mongodb driver
    // here — use the raw $in operator instead.
    const transactions = await this.transactionRepository.find({
      where: {
        type: 'expense',
        subcategory_id: { $in: subcategoryIds },
        created_at: { $gte: startDate, $lt: endDate },
      } as any,
    });

    return transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  }

  /**
   * Update the spent amount for a budget by recalculating from transactions
   */
  async updateSpent(budgetId: ObjectId): Promise<Budget> {
    const spent = await this.calculateSpent(budgetId);
    const budget = await this.budgetRepository.findOne({
      where: { _id: budgetId } as any,
    });

    if (!budget) {
      throw new Error('Budget not found');
    }

    budget.spent = spent;
    const saved = await this.budgetRepository.save(budget);
    await this.checkThresholds(budgetId);
    return saved;
  }

  /**
   * Check if budget has crossed thresholds and create alerts
   * Returns newly created alerts
   */
  async checkThresholds(budgetId: ObjectId): Promise<BudgetAlert[]> {
    const budget = await this.budgetRepository.findOne({
      where: { _id: budgetId } as any,
    });
    if (!budget) {
      return [];
    }

    const newAlerts: BudgetAlert[] = [];
    const percentageUsed = (budget.spent / budget.amount) * 100;

    // Check for overage (> 100%)
    if (percentageUsed > 100) {
      const existingOverage = await this.budgetAlertRepository.findOne({
        where: { budgetId, alertLevel: AlertLevel.OVERAGE },
      });
      if (!existingOverage) {
        const alert = this.budgetAlertRepository.create({
          budgetId,
          threshold: 100,
          alertLevel: AlertLevel.OVERAGE,
          triggeredAt: new Date(),
          acknowledged: false,
        });
        const saved = await this.budgetAlertRepository.save(alert);
        newAlerts.push(saved);
        await this.webhookService.emitEvent(
          WebhookEventType.BUDGET_THRESHOLD_OVERAGE,
          budget.userId,
          {
            budgetId,
            percentageUsed,
            spent: budget.spent,
            amount: budget.amount,
            alertLevel: AlertLevel.OVERAGE,
          },
        );
      }
    }
    // Check for exceeded (100%)
    else if (percentageUsed >= 100) {
      const existingExceeded = await this.budgetAlertRepository.findOne({
        where: { budgetId, alertLevel: AlertLevel.EXCEEDED },
      });
      if (!existingExceeded) {
        const alert = this.budgetAlertRepository.create({
          budgetId,
          threshold: 100,
          alertLevel: AlertLevel.EXCEEDED,
          triggeredAt: new Date(),
          acknowledged: false,
        });
        const saved = await this.budgetAlertRepository.save(alert);
        newAlerts.push(saved);
        await this.webhookService.emitEvent(
          WebhookEventType.BUDGET_THRESHOLD_EXCEEDED,
          budget.userId,
          {
            budgetId,
            percentageUsed,
            spent: budget.spent,
            amount: budget.amount,
            alertLevel: AlertLevel.EXCEEDED,
          },
        );
      }
    }
    // Check for warning (>= 90% and < 100%)
    else if (percentageUsed >= 90) {
      const existingWarning = await this.budgetAlertRepository.findOne({
        where: { budgetId, alertLevel: AlertLevel.WARNING },
      });
      if (!existingWarning) {
        const alert = this.budgetAlertRepository.create({
          budgetId,
          threshold: 90,
          alertLevel: AlertLevel.WARNING,
          triggeredAt: new Date(),
          acknowledged: false,
        });
        const saved = await this.budgetAlertRepository.save(alert);
        newAlerts.push(saved);
        await this.webhookService.emitEvent(
          WebhookEventType.BUDGET_THRESHOLD_WARNING,
          budget.userId,
          {
            budgetId,
            percentageUsed,
            spent: budget.spent,
            amount: budget.amount,
            alertLevel: AlertLevel.WARNING,
          },
        );
      }
    }

    return newAlerts;
  }

  /**
   * Get all alerts for a budget
   */
  async getAlerts(budgetId: ObjectId): Promise<BudgetAlert[]> {
    return this.budgetAlertRepository.find({
      where: { budgetId },
      order: { triggeredAt: 'DESC' },
    });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: ObjectId): Promise<BudgetAlert> {
    const alert = await this.budgetAlertRepository.findOne({
      where: { _id: alertId } as any,
    });
    if (!alert) {
      throw new Error('Alert not found');
    }
    alert.acknowledged = true;
    return this.budgetAlertRepository.save(alert);
  }

  /**
   * Get budget report for a month with spending trend
   */
  async getMonthlyReport(
    userId: number,
    month: string,
  ): Promise<{
    budgets: Budget[];
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    percentageUsed: number;
    alerts: BudgetAlert[];
  }> {
    const budgets = await this.findByMonth(userId, month);
    let totalBudget = 0;
    let totalSpent = 0;

    // Recalculate spent amounts
    for (const budget of budgets) {
      const updated = await this.updateSpent(budget.id);
      totalBudget += updated.amount;
      totalSpent += updated.spent;
    }

    const remaining = totalBudget - totalSpent;
    const percentageUsed =
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Fetch all alerts for this month.
    // TypeORM's In() operator does not match ObjectId values against the mongodb driver
    // here — use the raw $in operator instead (same fix as calculateSpent above).
    const alerts = await this.budgetAlertRepository.find({
      where: {
        budgetId: {
          $in: budgets.map((b) =>
            ObjectId.createFromHexString(b.id.toString()),
          ),
        },
      } as any,
      order: { triggeredAt: 'DESC' },
    });

    return {
      budgets,
      totalBudget,
      totalSpent,
      remaining,
      percentageUsed,
      alerts,
    };
  }

  /**
   * Get spending trend (last 6 months)
   */
  async getSpendingTrend(userId: number): Promise<
    Array<{
      month: string;
      totalBudget: number;
      totalSpent: number;
      percentageUsed: number;
    }>
  > {
    // Get last 6 months
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(month);
    }

    const trend = [];
    for (const month of months) {
      const report = await this.getMonthlyReport(userId, month);
      trend.push({
        month,
        totalBudget: report.totalBudget,
        totalSpent: report.totalSpent,
        percentageUsed: report.percentageUsed,
      });
    }

    return trend;
  }
}
