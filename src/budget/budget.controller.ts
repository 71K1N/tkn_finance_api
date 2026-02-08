import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { BudgetService } from './budget.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { BudgetResponseDto } from './dto/budget-response.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@Controller('budget')
@UseGuards(AuthGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  /**
   * Create a new budget for user's category/month
   * POST /budget
   */
  @Post()
  async create(
    @User() userId: number,
    @Body() createBudgetDto: CreateBudgetDto,
  ): Promise<BudgetResponseDto> {
    const budget = await this.budgetService.create(userId, createBudgetDto);
    return new BudgetResponseDto(budget);
  }

  /**
   * Get all budgets for a specific month
   * GET /budget?month=2024-01
   */
  @Get()
  async findByMonth(
    @User() userId: number,
    @Query('month') month: string,
  ): Promise<BudgetResponseDto[]> {
    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      throw new BadRequestException('month query parameter required in YYYY-MM format');
    }

    const budgets = await this.budgetService.findByMonth(userId, month);
    return budgets.map((b) => new BudgetResponseDto(b));
  }

  /**
   * Get single budget with details and alerts
   * GET /budget/:id
   */
  @Get(':id')
  async findOne(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<BudgetResponseDto> {
    const budgetId = parseInt(id, 10);
    if (isNaN(budgetId)) {
      throw new BadRequestException('id must be a valid number');
    }

    const budget = await this.budgetService.findOne(budgetId, userId);
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    // Recalculate spent amount before returning
    await this.budgetService.updateSpent(budgetId);
    const updatedBudget = await this.budgetService.findOne(budgetId, userId);

    // Fetch alerts
    const alerts = await this.budgetService.getAlerts(budgetId);

    return new BudgetResponseDto({
      ...updatedBudget,
      alerts: alerts.map((a) => ({
        id: a.id,
        budgetId: a.budgetId,
        threshold: a.threshold,
        alertLevel: a.alertLevel,
        triggeredAt: a.triggeredAt,
        acknowledged: a.acknowledged,
      })),
    });
  }

  /**
   * Update budget amount or rollover policy
   * PATCH /budget/:id
   */
  @Patch(':id')
  async update(
    @User() userId: number,
    @Param('id') id: string,
    @Body() updateBudgetDto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    const budgetId = parseInt(id, 10);
    if (isNaN(budgetId)) {
      throw new BadRequestException('id must be a valid number');
    }

    try {
      const budget = await this.budgetService.update(budgetId, userId, updateBudgetDto);
      return new BudgetResponseDto(budget);
    } catch (error) {
      throw new NotFoundException('Budget not found');
    }
  }

  /**
   * Delete budget
   * DELETE /budget/:id
   */
  @Delete(':id')
  async delete(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    const budgetId = parseInt(id, 10);
    if (isNaN(budgetId)) {
      throw new BadRequestException('id must be a valid number');
    }

    try {
      await this.budgetService.delete(budgetId, userId);
      return { message: 'Budget deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Budget not found');
    }
  }

  /**
   * Get monthly budget report with totals and alerts
   * GET /budget/report?month=2024-01
   */
  @Get('report/monthly')
  async getMonthlyReport(
    @User() userId: number,
    @Query('month') month: string,
  ): Promise<{
    budgets: BudgetResponseDto[];
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    percentageUsed: number;
    alerts: Array<{
      id: number;
      budgetId: number;
      threshold: number;
      alertLevel: string;
      triggeredAt: Date;
      acknowledged: boolean;
    }>;
  }> {
    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      throw new BadRequestException('month query parameter required in YYYY-MM format');
    }

    const report = await this.budgetService.getMonthlyReport(userId, month);

    return {
      budgets: report.budgets.map((b) => new BudgetResponseDto(b)),
      totalBudget: report.totalBudget,
      totalSpent: report.totalSpent,
      remaining: report.remaining,
      percentageUsed: report.percentageUsed,
      alerts: report.alerts.map((a) => ({
        id: a.id,
        budgetId: a.budgetId,
        threshold: a.threshold,
        alertLevel: a.alertLevel,
        triggeredAt: a.triggeredAt,
        acknowledged: a.acknowledged,
      })),
    };
  }

  /**
   * Get spending trend (last 6 months)
   * GET /budget/report/trend
   */
  @Get('report/trend')
  async getSpendingTrend(
    @User() userId: number,
  ): Promise<
    Array<{
      month: string;
      totalBudget: number;
      totalSpent: number;
      percentageUsed: number;
    }>
  > {
    return this.budgetService.getSpendingTrend(userId);
  }

  /**
   * Acknowledge a budget alert
   * PATCH /budget/alert/:alertId/acknowledge
   */
  @Patch('alert/:alertId/acknowledge')
  async acknowledgeAlert(
    @User() userId: number,
    @Param('alertId') alertId: string,
  ): Promise<{ message: string }> {
    const id = parseInt(alertId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('alertId must be a valid number');
    }

    try {
      await this.budgetService.acknowledgeAlert(id);
      return { message: 'Alert acknowledged' };
    } catch (error) {
      throw new NotFoundException('Alert not found');
    }
  }
}
