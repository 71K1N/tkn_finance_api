import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Budget Alert Triggering Integration (P2-E2E)', () => {
  let app: INestApplication;
  const budgetBaseUrl = '/budget';
  const transactionBaseUrl = '/transaction';
  const bankAccountBaseUrl = '/bank-account';
  const authToken = 'Bearer 1'; // userId: 1
  let categoryId: number;
  let subcategoryId: number;
  let bankAccountId: number;
  let budgetId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // Create category
    const categoryResponse = await request(app.getHttpServer())
      .post('/category')
      .set('Authorization', authToken)
      .send({ name: 'Food', description: 'Food Expenses' });
    categoryId = categoryResponse.body.id;

    // Create subcategory
    const subcategoryResponse = await request(app.getHttpServer())
      .post('/subcategory')
      .set('Authorization', authToken)
      .send({
        name: 'Groceries',
        description: 'Grocery shopping',
        categoryId,
      });
    subcategoryId = subcategoryResponse.body.id;

    // Create bank account
    const accountResponse = await request(app.getHttpServer())
      .post(bankAccountBaseUrl)
      .set('Authorization', authToken)
      .send({
        description: 'Checking Account',
        balance: 10000,
      });
    bankAccountId = accountResponse.body.id;

    // Create budget with $1000 limit
    const budgetResponse = await request(app.getHttpServer())
      .post(budgetBaseUrl)
      .set('Authorization', authToken)
      .send({
        categoryId,
        month: '2026-02',
        amount: 1000,
        rolloverPolicy: 'no_rollover',
      });
    budgetId = budgetResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Budget Alert Threshold Detection (90%)', () => {
    it('should trigger warning alert at 90% threshold', async () => {
      // Create a transaction for $900 out of $1000 budget
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 900,
          bankAccountId,
          subcategoryId,
          description: 'Grocery purchase',
        })
        .expect(201);

      // Check budget and verify warning alert exists
      const budgetResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(budgetResponse.body.spent).toBeGreaterThanOrEqual(900);

      // Budget should have warning alert
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-02`)
        .set('Authorization', authToken)
        .expect(200);

      const budget = budgetsResponse.body[0];
      const alerts = budget.alerts || [];
      const warningAlert = alerts.find((a) => a.alertLevel === 'warning');
      expect(warningAlert).toBeDefined();
    });
  });

  describe('Budget Alert Threshold Detection (100%)', () => {
    let testBudgetId: number;

    beforeAll(async () => {
      // Create a new budget for testing exceeded threshold
      const budgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: '2026-03',
          amount: 1000,
          rolloverPolicy: 'no_rollover',
        });
      testBudgetId = budgetResponse.body.id;
    });

    it('should trigger exceeded alert at 100% threshold', async () => {
      // Create multiple transactions to reach exactly $1000
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 500,
          bankAccountId,
          subcategoryId,
          description: 'First purchase',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 500,
          bankAccountId,
          subcategoryId,
          description: 'Second purchase',
        })
        .expect(201);

      // Check budget for exceeded alert
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-03`)
        .set('Authorization', authToken)
        .expect(200);

      const budget = budgetsResponse.body.find((b) => b.id === testBudgetId);
      expect(budget.spent).toBeGreaterThanOrEqual(1000);

      const alerts = budget.alerts || [];
      const exceededAlert = alerts.find((a) => a.alertLevel === 'exceeded');
      expect(exceededAlert).toBeDefined();
    });

    it('should only trigger exceeded alert once, not duplicate', async () => {
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-03`)
        .set('Authorization', authToken);

      const budget = budgetsResponse.body.find((b) => b.id === testBudgetId);
      const alerts = budget.alerts || [];
      const exceededAlerts = alerts.filter((a) => a.alertLevel === 'exceeded');
      expect(exceededAlerts.length).toBe(1);
    });
  });

  describe('Budget Alert Threshold Detection (>100%)', () => {
    let ovarageBudgetId: number;

    beforeAll(async () => {
      // Create a new budget for testing overage threshold
      const budgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: '2026-04',
          amount: 1000,
          rolloverPolicy: 'no_rollover',
        });
      ovarageBudgetId = budgetResponse.body.id;
    });

    it('should trigger overage alert when exceeding budget by >100%', async () => {
      // Create transaction exceeding budget limit - $1200 over $1000 budget
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 1200,
          bankAccountId,
          subcategoryId,
          description: 'Large purchase',
        })
        .expect(201);

      // Check budget for overage alert
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-04`)
        .set('Authorization', authToken)
        .expect(200);

      const budget = budgetsResponse.body.find((b) => b.id === ovarageBudgetId);
      expect(budget.spent).toBeGreaterThan(1000);

      const alerts = budget.alerts || [];
      const overageAlert = alerts.find((a) => a.alertLevel === 'overage');
      expect(overageAlert).toBeDefined();
    });

    it('should only trigger overage alert once, not duplicate', async () => {
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-04`)
        .set('Authorization', authToken);

      const budget = budgetsResponse.body.find((b) => b.id === ovarageBudgetId);
      const alerts = budget.alerts || [];
      const overageAlerts = alerts.filter((a) => a.alertLevel === 'overage');
      expect(overageAlerts.length).toBe(1);
    });
  });

  describe('Alert Acknowledgement', () => {
    let alertTestBudgetId: number;
    let alertId: number;

    beforeAll(async () => {
      // Create budget and trigger alert
      const budgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: '2026-05',
          amount: 1000,
          rolloverPolicy: 'no_rollover',
        });
      alertTestBudgetId = budgetResponse.body.id;

      // Create transaction to trigger warning alert
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 900,
          bankAccountId,
          subcategoryId,
          description: 'Purchase to trigger alert',
        })
        .expect(201);

      // Get the alert ID
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-05`)
        .set('Authorization', authToken);

      const budget = budgetsResponse.body.find(
        (b) => b.id === alertTestBudgetId,
      );
      const alert = budget.alerts[0];
      alertId = alert.id;
    });

    it('should acknowledge alert and mark as read', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${budgetBaseUrl}/alert/${alertId}/acknowledge`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.acknowledged).toBe(true);
    });

    it('acknowledged alert should persist on retrieval', async () => {
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-05`)
        .set('Authorization', authToken);

      const budget = budgetsResponse.body.find(
        (b) => b.id === alertTestBudgetId,
      );
      const alert = budget.alerts.find((a) => a.id === alertId);
      expect(alert.acknowledged).toBe(true);
    });
  });

  describe('Multiple Budgets & Simultaneous Alerts', () => {
    it('should handle multiple budgets in same month independently', async () => {
      // Create Food budget
      const foodBudgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: '2026-06',
          amount: 500,
          rolloverPolicy: 'no_rollover',
        });

      // Create different category for Transport
      const transportCategoryResponse = await request(app.getHttpServer())
        .post('/category')
        .set('Authorization', authToken)
        .send({ name: 'Transport', description: 'Transport Expenses' });

      const transportCategoryId = transportCategoryResponse.body.id;

      const transportSubcategoryResponse = await request(app.getHttpServer())
        .post('/subcategory')
        .set('Authorization', authToken)
        .send({
          name: 'Gas',
          description: 'Gasoline',
          categoryId: transportCategoryId,
        });

      const transportSubcategoryId = transportSubcategoryResponse.body.id;

      const transportBudgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId: transportCategoryId,
          month: '2026-06',
          amount: 300,
          rolloverPolicy: 'no_rollover',
        });

      // Trigger warning on food budget
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 450,
          bankAccountId,
          subcategoryId,
          description: 'Food expense',
        })
        .expect(201);

      // Trigger exceeded on transport budget
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 300,
          bankAccountId,
          subcategoryId: transportSubcategoryId,
          description: 'Transport expense',
        })
        .expect(201);

      // Verify monthly report shows both budgets with their alerts
      const reportResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/monthly?month=2026-06`)
        .set('Authorization', authToken)
        .expect(200);

      expect(reportResponse.body).toHaveProperty('month', '2026-06');
      expect(reportResponse.body).toHaveProperty('totalBudgeted');
      expect(reportResponse.body).toHaveProperty('totalSpent');
      expect(reportResponse.body).toHaveProperty('totalRemaining');
      expect(reportResponse.body).toHaveProperty('budgets');
      expect(Array.isArray(reportResponse.body.budgets)).toBe(true);
    });
  });

  describe('Spending Trend Reporting', () => {
    it('should report 6-month spending trends', async () => {
      const response = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/trend`)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      response.body.forEach((monthData) => {
        expect(monthData).toHaveProperty('month');
        expect(monthData).toHaveProperty('totalBudgeted');
        expect(monthData).toHaveProperty('totalSpent');
        expect(monthData).toHaveProperty('budgetCount');
      });
    });
  });

  describe('Authorization on Alerts', () => {
    let userSpecificBudgetId: number;

    beforeAll(async () => {
      // Create budget for user 1
      const budgetResponse = await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', 'Bearer 1')
        .send({
          categoryId,
          month: '2026-07',
          amount: 1000,
          rolloverPolicy: 'no_rollover',
        });
      userSpecificBudgetId = budgetResponse.body.id;

      // Trigger alert
      await request(app.getHttpServer())
        .post(transactionBaseUrl)
        .set('Authorization', 'Bearer 1')
        .send({
          type: 'expense',
          amount: 900,
          bankAccountId,
          subcategoryId,
        });
    });

    it('user should not be able to access other users budget alerts', async () => {
      const budgetsResponse = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}?month=2026-07`)
        .set('Authorization', 'Bearer 2')
        .expect(200);

      const userBudget = budgetsResponse.body.find(
        (b) => b.id === userSpecificBudgetId,
      );
      expect(userBudget).toBeUndefined();
    });
  });
});
