import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import Groq from 'groq-sdk';
import {
  InsightSnapshot,
  InsightHighlight,
} from './entities/insight-snapshot.entity';
import { TransactionService } from '../transaction/transaction.service';
import { BudgetService } from '../budget/budget.service';
import { BankAccountService } from '../bank-account/bank-account.service';
import { SavingsGoalService } from '../savings-goal/savings-goal.service';

const GROQ_MODEL = 'llama-3.1-8b-instant';
const ANOMALY_THRESHOLD_MULTIPLIER = 1.5;

interface FactsBundle {
  month: string;
  totalBalance: number;
  summary: { totalIncome: number; totalExpenses: number; balance: number };
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
  categoryBreakdown: Array<{
    categoryName: string;
    total: number;
    transactionCount: number;
  }>;
  budgetReport: {
    totalBudget: number;
    totalSpent: number;
    percentageUsed: number;
    alerts: Array<{ alertLevel: string; threshold: number }>;
  };
  forecastedExpenses: {
    totalPending: number;
    categories: Array<{ categoryName: string; total: number }>;
  };
  savingsGoals: Array<{
    name: string;
    targetAmount: number;
    currentSaved: number;
    percentageComplete: number;
    monthlyAllocation: number;
    projectedCompletionDate: Date | null;
  }>;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly groq: Groq | null;

  constructor(
    @InjectRepository(InsightSnapshot)
    private insightSnapshotRepository: MongoRepository<InsightSnapshot>,
    private transactionService: TransactionService,
    private budgetService: BudgetService,
    private bankAccountService: BankAccountService,
    private savingsGoalService: SavingsGoalService,
  ) {
    this.groq = process.env.GROQ_API_KEY
      ? new Groq({ apiKey: process.env.GROQ_API_KEY })
      : null;
  }

  async getOrCreate(userId: number): Promise<InsightSnapshot> {
    const today = this.todayString();
    const existing = await this.insightSnapshotRepository.findOne({
      where: { userId, date: today } as any,
    });
    if (existing) {
      return existing;
    }
    return this.generate(userId, today);
  }

  async refresh(userId: number): Promise<InsightSnapshot> {
    const today = this.todayString();
    await this.insightSnapshotRepository.deleteOne({
      userId,
      date: today,
    } as any);
    return this.generate(userId, today);
  }

  private async generate(
    userId: number,
    date: string,
  ): Promise<InsightSnapshot> {
    const { facts, trailingAverageByCategory } = await this.gatherFacts(userId);
    const highlights = this.detectAnomalies(facts, trailingAverageByCategory);
    const forecastHighlight = this.buildForecastHighlight(facts);
    if (forecastHighlight) {
      highlights.push(forecastHighlight);
    }
    const { summary, source, modelUsed } = await this.generateSummary(
      facts,
      highlights,
    );

    const snapshot = this.insightSnapshotRepository.create({
      userId,
      date,
      facts: facts as unknown as Record<string, unknown>,
      summary,
      highlights,
      source,
      modelUsed,
      created_by: userId,
      updated_by: userId,
    });
    return this.insightSnapshotRepository.save(snapshot);
  }

  private async gatherFacts(userId: number): Promise<{
    facts: FactsBundle;
    trailingAverageByCategory: Map<string, number>;
  }> {
    const month = this.currentMonthString();
    const trailingMonths = this.monthsBefore(month, 3);

    const [
      summary,
      monthlyTrend,
      categoryBreakdown,
      trailingBreakdowns,
      budgetReport,
      forecastedExpenses,
      totalBalance,
      savingsGoalsResult,
    ] = await Promise.all([
      this.transactionService.getSummary(userId, month),
      this.transactionService.getMonthlyTrend(userId, 6),
      this.transactionService.getCategoryBreakdown(userId, month),
      Promise.all(
        trailingMonths.map((m) =>
          this.transactionService.getCategoryBreakdown(userId, m),
        ),
      ),
      this.budgetService.getMonthlyReport(userId, month),
      this.transactionService.getForecastedExpenses(userId, month),
      this.bankAccountService.getTotalBalance(),
      this.savingsGoalService.findAll(userId, {
        page: 1,
        pageSize: 100,
      } as any),
    ]);

    const trailingTotalByCategory = new Map<string, number>();
    for (const breakdown of trailingBreakdowns) {
      for (const c of breakdown.categories) {
        trailingTotalByCategory.set(
          c.categoryName,
          (trailingTotalByCategory.get(c.categoryName) ?? 0) + c.total,
        );
      }
    }
    const trailingAverageByCategory = new Map(
      Array.from(trailingTotalByCategory.entries()).map(([name, total]) => [
        name,
        total / trailingMonths.length,
      ]),
    );

    const facts: FactsBundle = {
      month,
      totalBalance,
      summary,
      monthlyTrend,
      categoryBreakdown: categoryBreakdown.categories,
      budgetReport: {
        totalBudget: budgetReport.totalBudget,
        totalSpent: budgetReport.totalSpent,
        percentageUsed: budgetReport.percentageUsed,
        alerts: budgetReport.alerts.map((a) => ({
          alertLevel: a.alertLevel,
          threshold: a.threshold,
        })),
      },
      forecastedExpenses: {
        totalPending: forecastedExpenses.totalPending,
        categories: forecastedExpenses.categories.map((c) => ({
          categoryName: c.categoryName,
          total: c.total,
        })),
      },
      savingsGoals: savingsGoalsResult.data.map((g) => ({
        name: g.name,
        targetAmount: g.targetAmount,
        currentSaved: g.currentSaved,
        percentageComplete: Math.min(
          100,
          (g.currentSaved / g.targetAmount) * 100,
        ),
        monthlyAllocation: g.monthlyAllocation,
        projectedCompletionDate: g.projectedCompletionDate,
      })),
    };

    return { facts, trailingAverageByCategory };
  }

  private detectAnomalies(
    facts: FactsBundle,
    trailingAverageByCategory: Map<string, number>,
  ): InsightHighlight[] {
    const highlights: InsightHighlight[] = [];

    for (const category of facts.categoryBreakdown) {
      const trailingAverage = trailingAverageByCategory.get(
        category.categoryName,
      );
      if (!trailingAverage || trailingAverage <= 0) continue;

      const ratio = category.total / trailingAverage;
      if (ratio >= ANOMALY_THRESHOLD_MULTIPLIER) {
        const percentageIncrease = Math.round((ratio - 1) * 100);
        highlights.push({
          message: `Gastos com ${category.categoryName} estão ${percentageIncrease}% acima da média dos últimos 3 meses.`,
          severity: percentageIncrease >= 100 ? 'critical' : 'warning',
          categoryName: category.categoryName,
          amount: category.total,
          percentageIncrease,
        });
      }
    }

    for (const alert of facts.budgetReport.alerts) {
      highlights.push({
        message:
          alert.alertLevel === 'overage'
            ? 'Um orçamento ultrapassou o valor planejado este mês.'
            : alert.alertLevel === 'exceeded'
              ? 'Um orçamento atingiu 100% do valor planejado este mês.'
              : 'Um orçamento está próximo do limite (90%) este mês.',
        severity: alert.alertLevel === 'warning' ? 'warning' : 'critical',
      });
    }

    for (const goal of facts.savingsGoals) {
      if (goal.percentageComplete >= 100) continue;
      if (goal.monthlyAllocation <= 0 || !goal.projectedCompletionDate) {
        highlights.push({
          message: `A meta "${goal.name}" não tem um aporte mensal suficiente para ser concluída.`,
          severity: 'warning',
        });
      }
    }

    return highlights;
  }

  /**
   * Looks at expenses due this month that haven't been paid yet (getForecastedExpenses)
   * and turns them into a forward-looking highlight naming the pending total and its
   * biggest category — the LLM is later asked to phrase a next-month suggestion from
   * this, without inventing its own numbers.
   */
  private buildForecastHighlight(facts: FactsBundle): InsightHighlight | null {
    const { totalPending, categories } = facts.forecastedExpenses;
    if (totalPending <= 0) return null;

    const topCategory = categories.reduce<(typeof categories)[number] | null>(
      (top, c) => (!top || c.total > top.total ? c : top),
      null,
    );

    const projectedTotal = facts.summary.totalExpenses + totalPending;
    const isAtRisk = projectedTotal > facts.summary.totalIncome;

    const categoryNote = topCategory
      ? `, com destaque para ${topCategory.categoryName} (${this.formatCurrency(topCategory.total)})`
      : '';

    return {
      message: `Ainda há ${this.formatCurrency(totalPending)} em despesas previstas para este mês que ainda não foram pagas${categoryNote}.`,
      severity: isAtRisk ? 'warning' : 'info',
      categoryName: topCategory?.categoryName,
      amount: totalPending,
    };
  }

  private async generateSummary(
    facts: FactsBundle,
    highlights: InsightHighlight[],
  ): Promise<{
    summary: string;
    source: 'llm' | 'template';
    modelUsed: string | null;
  }> {
    if (this.groq) {
      try {
        const completion = await this.groq.chat.completions.create({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Você é um assistente financeiro. Você recebe um JSON com fatos financeiros ' +
                'já calculados (números reais) e uma lista de destaques/alertas já detectados. ' +
                'Sua única tarefa é narrar esses fatos em um resumo curto (2-3 frases) em ' +
                'português do Brasil, em tom direto e útil. Se facts.forecastedExpenses.totalPending ' +
                'for maior que zero, termine o resumo com uma frase de sugestão prática e acionável ' +
                'sobre como o usuário poderia se planejar melhor no próximo mês, com base nesses ' +
                'valores previstos (ex: rever o orçamento da categoria com maior gasto previsto). ' +
                'NUNCA invente números — use apenas os valores fornecidos. Responda em JSON no ' +
                'formato exato: {"summary": "..."}',
            },
            {
              role: 'user',
              content: JSON.stringify({ facts, highlights }),
            },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as { summary?: string };
          if (parsed.summary) {
            return {
              summary: parsed.summary,
              source: 'llm',
              modelUsed: GROQ_MODEL,
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          `Groq call failed, falling back to template summary: ${(error as Error).message}`,
        );
      }
    }

    return {
      summary: this.buildTemplateSummary(facts, highlights),
      source: 'template',
      modelUsed: null,
    };
  }

  private buildTemplateSummary(
    facts: FactsBundle,
    highlights: InsightHighlight[],
  ): string {
    const { totalIncome, totalExpenses, balance } = facts.summary;
    const base =
      `Este mês você recebeu ${this.formatCurrency(totalIncome)} e gastou ` +
      `${this.formatCurrency(totalExpenses)}, resultando em um saldo de ` +
      `${this.formatCurrency(balance)}.`;

    const middle =
      highlights.length === 0
        ? 'Nenhuma anomalia foi detectada nos seus gastos.'
        : highlights[0].message;

    return `${base} ${middle}${this.buildForecastSuggestion(facts)}`;
  }

  private buildForecastSuggestion(facts: FactsBundle): string {
    const { totalPending, categories } = facts.forecastedExpenses;
    if (totalPending <= 0) return '';

    const topCategory = categories.reduce<(typeof categories)[number] | null>(
      (top, c) => (!top || c.total > top.total ? c : top),
      null,
    );

    return topCategory
      ? ` Para o próximo mês, considere revisar o orçamento de ${topCategory.categoryName}, que concentra a maior parte das despesas ainda previstas.`
      : ' Para o próximo mês, considere revisar o planejamento das despesas ainda previstas.';
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private currentMonthString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthsBefore(month: string, n: number): string[] {
    const [year, monthNum] = month.split('-').map(Number);
    const months: string[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(year, monthNum - 1 - i, 1);
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }
    return months;
  }
}
