import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { Budget, RolloverPolicy } from './entities/budget.entity';
import { BudgetAlert, AlertLevel } from './entities/budget-alert.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(Budget)
    private budgetRepository: Repository<Budget>,
    @InjectRepository(BudgetAlert)
    private budgetAlertRepository: Repository<BudgetAlert>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
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
      categoryId: createBudgetDto.categoryId,
      month: createBudgetDto.month,
      amount: createBudgetDto.amount,
      rolloverPolicy: createBudgetDto.rolloverPolicy || RolloverPolicy.NO_ROLLOVER,
      spent: 0,
      created_by: userId,
    });
    return this.budgetRepository.save(budget);
  }

  /**
   * Find all budgets for a specific user and month
   */
  async findByMonth(userId: number, month: string): Promise<Budget[]> {
    return this.budgetRepository.find({
      where: { userId, month },
      relations: ['alerts'],
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
      relations: ['alerts'],
      order: { month: 'DESC' },
    });
  }

  /**
   * Find budget by ID and verify ownership
   */
  async findOne(id: number, userId: number): Promise<Budget | null> {
    const budget = await this.budgetRepository.findOne({
      where: { id },
      relations: ['alerts'],
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
    id: number,
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
  async delete(id: number, userId: number): Promise<void> {
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
  async calculateSpent(budgetId: number): Promise<number> {
    const budget = await this.budgetRepository.findOne({ where: { id: budgetId } });
    if (!budget) {
      return 0;
    }

    // Parse month string YYYY-MM to get start and end dates
    const [year, month] = budget.month.split('-');
    const startDate = new Date(`${year}-${month}-01T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Sum all expense transactions for this category in this month
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(CAST(t.amount AS REAL))', 'total')
      .where('t.type = :type', { type: 'expense' })
      .andWhere('t.subcategoryId IN (:...subcategoryIds)', {
        subcategoryIds: [budget.categoryId], // Simplified: assume direct mapping
      })
      .andWhere('t.created_at >= :startDate', { startDate })
      .andWhere('t.created_at < :endDate', { endDate })
      .getRawOne();

    return result?.total ? parseFloat(result.total) : 0;
  }

  /**
   * Update the spent amount for a budget by recalculating from transactions
   */
  async updateSpent(budgetId: number): Promise<Budget> {
    const spent = await this.calculateSpent(budgetId);
    const budget = await this.budgetRepository.findOne({ where: { id: budgetId } });

    if (!budget) {
      throw new Error('Budget not found');
    }

    budget.spent = spent;
    return this.budgetRepository.save(budget);
  }

  /**
   * Check if budget has crossed thresholds and create alerts
   * Returns newly created alerts
   */
  async checkThresholds(budgetId: number): Promise<BudgetAlert[]> {
    const budget = await this.budgetRepository.findOne({ where: { id: budgetId } });
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
      }
    }

    return newAlerts;
  }

  /**
   * Get all alerts for a budget
   */
  async getAlerts(budgetId: number): Promise<BudgetAlert[]> {
    return this.budgetAlertRepository.find({
      where: { budgetId },
      order: { triggeredAt: 'DESC' },
    });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: number): Promise<BudgetAlert> {
    const alert = await this.budgetAlertRepository.findOne({ where: { id: alertId } });
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
      await this.updateSpent(budget.id);
      totalBudget += budget.amount;
      totalSpent += budget.spent;
    }

    const remaining = totalBudget - totalSpent;
    const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Fetch all alerts for this month
    const alerts = await this.budgetAlertRepository
      .createQueryBuilder('a')
      .where('a.budgetId IN (:...budgetIds)', {
        budgetIds: budgets.map((b) => b.id),
      })
      .orderBy('a.triggeredAt', 'DESC')
      .getMany();

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
