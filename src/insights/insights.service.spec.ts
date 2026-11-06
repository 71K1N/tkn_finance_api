import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsightsService } from './insights.service';
import { InsightSnapshot } from './entities/insight-snapshot.entity';
import { TransactionService } from '../transaction/transaction.service';
import { BudgetService } from '../budget/budget.service';
import { BankAccountService } from '../bank-account/bank-account.service';
import { SavingsGoalService } from '../savings-goal/savings-goal.service';
import { SummaryStatus } from '../transaction/summary-status.enum';
import { currentMonthString } from '../common/date/month-range.util';

interface Scenario {
  /** Expenses valued at status=paid — money that actually moved. */
  paidExpenses: number;
  /** Expenses valued at status=all — includes the pending ones. */
  allExpenses: number;
  /** Unpaid expenses due this month, from getForecastedExpenses. */
  pending: number;
  income: number;
}

describe('InsightsService', () => {
  let service: InsightsService;
  let transactionService: {
    getSummary: jest.Mock;
    getMonthlyTrend: jest.Mock;
    getCategoryBreakdown: jest.Mock;
    getForecastedExpenses: jest.Mock;
  };
  let budgetService: { getMonthlyReport: jest.Mock };

  /**
   * Wires the mocks for one scenario and runs a full snapshot generation, returning
   * the forecast highlight (the only highlight these scenarios can produce — there are
   * no category anomalies, budget alerts, or savings goals in play).
   */
  async function forecastHighlightFor(scenario: Scenario) {
    const { paidExpenses, allExpenses, pending, income } = scenario;

    transactionService.getSummary.mockImplementation(
      async (_userId: number, params: { status?: SummaryStatus }) => {
        const totalExpenses =
          params?.status === SummaryStatus.PAID ? paidExpenses : allExpenses;
        return {
          totalExpenses,
          totalIncome: income,
          balance: income - totalExpenses,
        };
      },
    );
    transactionService.getForecastedExpenses.mockResolvedValue({
      month: '2026-08',
      totalPending: pending,
      categories: pending
        ? [
            {
              categoryId: 'c1',
              categoryName: 'Moradia',
              total: pending,
              transactionCount: 1,
            },
          ]
        : [],
    });

    const snapshot: any = await service.getOrCreate(1);
    return snapshot.highlights.find((h: any) =>
      h.message.startsWith('Ainda há'),
    );
  }

  /**
   * The projected total is not exposed on the snapshot — the at-risk severity is the
   * only surface it reaches. Severity is a step function that flips exactly where the
   * projection crosses income, so pinning the flip point pins the projection itself:
   * income equal to the projection must not warn, a hair below it must.
   */
  async function expectProjection(
    scenario: Omit<Scenario, 'income'>,
    projected: number,
  ) {
    const atProjection = await forecastHighlightFor({
      ...scenario,
      income: projected,
    });
    const justBelow = await forecastHighlightFor({
      ...scenario,
      income: projected - 0.01,
    });

    expect(atProjection.severity).toBe('info');
    expect(justBelow.severity).toBe('warning');
  }

  beforeEach(async () => {
    // Keep the LLM path out of it — generateSummary falls back to the template.
    delete process.env.GROQ_API_KEY;

    transactionService = {
      getSummary: jest.fn(),
      getMonthlyTrend: jest.fn().mockResolvedValue([]),
      getCategoryBreakdown: jest
        .fn()
        .mockResolvedValue({ month: '2026-08', categories: [] }),
      getForecastedExpenses: jest.fn().mockResolvedValue({
        month: currentMonthString(),
        totalPending: 0,
        categories: [],
      }),
    };
    budgetService = {
      getMonthlyReport: jest.fn().mockResolvedValue({
        totalBudget: 0,
        totalSpent: 0,
        percentageUsed: 0,
        alerts: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        {
          provide: getRepositoryToken(InsightSnapshot),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            deleteOne: jest.fn(),
            create: jest.fn((x) => x),
            save: jest.fn(async (x) => x),
          },
        },
        { provide: TransactionService, useValue: transactionService },
        { provide: BudgetService, useValue: budgetService },
        {
          provide: BankAccountService,
          useValue: { getTotalBalance: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: SavingsGoalService,
          useValue: { findAll: jest.fn().mockResolvedValue({ data: [] }) },
        },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
  });

  describe('forecast projection', () => {
    it('gathers a realized (paid) summary alongside the all summary', async () => {
      await forecastHighlightFor({
        paidExpenses: 600,
        allExpenses: 1000,
        pending: 400,
        income: 5000,
      });

      const statuses = transactionService.getSummary.mock.calls.map(
        ([, params]) => params?.status,
      );
      expect(statuses).toContain(SummaryStatus.PAID);
      expect(statuses).toContain(undefined);
    });

    it('projects realized plus pending, not the all total plus pending', async () => {
      // The all total (1000) already contains the 400 that is still pending; the
      // projection must be 600 + 400, not 1000 + 400.
      await expectProjection(
        { paidExpenses: 600, allExpenses: 1000, pending: 400 },
        1000,
      );
    });

    it('raises the projection by exactly the amount of an unpaid expense', async () => {
      await expectProjection(
        { paidExpenses: 600, allExpenses: 900, pending: 300 },
        900,
      );
      // Same realized figure, one more unpaid expense worth 200 — the projection moves
      // by exactly 200 and by nothing else.
      await expectProjection(
        { paidExpenses: 600, allExpenses: 1100, pending: 500 },
        1100,
      );
    });

    it('projects what is pending when nothing has been paid', async () => {
      await expectProjection(
        { paidExpenses: 0, allExpenses: 500, pending: 500 },
        500,
      );
    });

    it('projects what was paid when (almost) nothing is pending', async () => {
      await expectProjection(
        { paidExpenses: 800, allExpenses: 800.01, pending: 0.01 },
        800.01,
      );
    });

    it('emits no forecast highlight when nothing at all is pending', async () => {
      const highlight = await forecastHighlightFor({
        paidExpenses: 800,
        allExpenses: 800,
        pending: 0,
        income: 100,
      });

      // Nothing is owed, so there is nothing to project beyond what was already paid —
      // not even when the month is already over budget.
      expect(highlight).toBeUndefined();
    });

    it('does not warn when only the double-counted total would exceed income', async () => {
      // Correct projection 600 + 400 = 1000, within the 1050 income. The old
      // arithmetic (allExpenses + pending = 1400) would have crossed it.
      const highlight = await forecastHighlightFor({
        paidExpenses: 600,
        allExpenses: 1000,
        pending: 400,
        income: 1050,
      });

      expect(highlight.severity).toBe('info');
    });

    it('warns when the projection genuinely exceeds income', async () => {
      const highlight = await forecastHighlightFor({
        paidExpenses: 800,
        allExpenses: 1200,
        pending: 400,
        income: 1000,
      });

      expect(highlight.severity).toBe('warning');
    });
  });

  interface Category {
    categoryName: string;
    total: number;
  }

  /**
   * Wires category-anomaly, budget-alert, and forecast inputs and runs a full
   * snapshot generation, returning the resulting highlights (already sorted) and
   * summary.
   */
  async function snapshotFor(config: {
    currentCategories?: Category[];
    trailingCategories?: Category[];
    budgetAlerts?: Array<{ alertLevel: string; threshold: number }>;
    pending?: number;
    forecastCategories?: Category[];
    income?: number;
  }) {
    const month = currentMonthString();
    const {
      currentCategories = [],
      trailingCategories = [],
      budgetAlerts = [],
      pending = 0,
      forecastCategories = [],
      income = 100000,
    } = config;

    transactionService.getSummary.mockResolvedValue({
      totalExpenses: 0,
      totalIncome: income,
      balance: income,
    });
    transactionService.getCategoryBreakdown.mockImplementation(
      async (_userId: number, m: string) => ({
        month: m,
        categories: m === month ? currentCategories : trailingCategories,
      }),
    );
    transactionService.getForecastedExpenses.mockResolvedValue({
      month,
      totalPending: pending,
      categories: forecastCategories,
    });
    budgetService.getMonthlyReport.mockResolvedValue({
      totalBudget: 0,
      totalSpent: 0,
      percentageUsed: 0,
      alerts: budgetAlerts,
    });

    const snapshot: any = await service.getOrCreate(1);
    return { highlights: snapshot.highlights, summary: snapshot.summary };
  }

  describe('highlight prioritization', () => {
    it('orders highlights by severity: critical, then warning, then info', async () => {
      const { highlights } = await snapshotFor({
        // 160 vs a trailing average of 100 -> +60%, below the 100% critical cutoff.
        currentCategories: [{ categoryName: 'Lazer', total: 160 }],
        trailingCategories: [{ categoryName: 'Lazer', total: 100 }],
        budgetAlerts: [{ alertLevel: 'exceeded', threshold: 100 }],
        // Small pending amount against a large income keeps the forecast highlight
        // at severity 'info' (not at risk).
        pending: 100,
        forecastCategories: [{ categoryName: 'Aluguel', total: 100 }],
      });

      expect(highlights.map((h: any) => h.severity)).toEqual([
        'critical',
        'warning',
        'info',
      ]);
    });

    it('orders same-severity highlights by percentageIncrease descending', async () => {
      const { highlights } = await snapshotFor({
        // Detected in this order but must come back reversed: 200% vs 2308%, both
        // 'critical'.
        currentCategories: [
          { categoryName: 'Veiculo', total: 300 },
          { categoryName: 'Transporte', total: 2408 },
        ],
        trailingCategories: [
          { categoryName: 'Veiculo', total: 100 },
          { categoryName: 'Transporte', total: 100 },
        ],
      });

      expect(
        highlights.map((h: any) => [h.categoryName, h.percentageIncrease]),
      ).toEqual([
        ['Transporte', 2308],
        ['Veiculo', 200],
      ]);
    });

    it('sorts a same-severity highlight without a percentageIncrease after one that has it', async () => {
      const { highlights } = await snapshotFor({
        // 60% increase -> 'warning', carries a percentageIncrease.
        currentCategories: [{ categoryName: 'Lazer', total: 160 }],
        trailingCategories: [{ categoryName: 'Lazer', total: 100 }],
        // Near-limit budget alert -> 'warning' too, but has no percentageIncrease.
        budgetAlerts: [{ alertLevel: 'warning', threshold: 90 }],
      });

      expect(highlights).toHaveLength(2);
      expect(highlights[0].severity).toBe('warning');
      expect(highlights[0].percentageIncrease).toBe(60);
      expect(highlights[1].severity).toBe('warning');
      expect(highlights[1].percentageIncrease).toBeUndefined();
    });

    it('quotes the top-priority highlight in the template summary, not the first-detected one', async () => {
      // Regression test for the production symptom: "Casa" (80%, warning) was detected
      // before "Transporte" (2308%, critical), and the template blindly quoted
      // highlights[0] — the far less severe one.
      const { highlights, summary } = await snapshotFor({
        currentCategories: [
          { categoryName: 'Casa', total: 180 },
          { categoryName: 'Transporte', total: 2408 },
        ],
        trailingCategories: [
          { categoryName: 'Casa', total: 100 },
          { categoryName: 'Transporte', total: 100 },
        ],
      });

      expect(highlights[0].categoryName).toBe('Transporte');
      expect(summary).toContain(
        'Gastos com Transporte estão 2308% acima da média dos últimos 3 meses',
      );
      expect(summary).not.toContain('Casa');
    });
  });

  describe('highlight baseline context', () => {
    it('includes the formatted baseline and current amounts in a category-anomaly message', async () => {
      const { highlights } = await snapshotFor({
        currentCategories: [{ categoryName: 'Transporte', total: 2408 }],
        trailingCategories: [{ categoryName: 'Transporte', total: 100 }],
      });

      const highlight = highlights.find(
        (h: any) => h.categoryName === 'Transporte',
      );
      expect(highlight.message).toContain('2308%');
      expect(highlight.message).toContain(
        new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(100),
      );
      expect(highlight.message).toContain(
        new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(2408),
      );
    });

    it('carries the trailing 3-month average as previousAverage on the highlight', async () => {
      const { highlights } = await snapshotFor({
        currentCategories: [{ categoryName: 'Transporte', total: 2408 }],
        trailingCategories: [{ categoryName: 'Transporte', total: 100 }],
      });

      const highlight = highlights.find(
        (h: any) => h.categoryName === 'Transporte',
      );
      expect(highlight.previousAverage).toBe(100);
    });
  });
});
