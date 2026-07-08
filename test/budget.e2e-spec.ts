import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Budget Management E2E Tests (P2)', () => {
  let app: INestApplication;
  const userId = 1;
  const authToken = `Bearer ${userId}`;

  // Test data
  const categoryId = '507f1f77bcf86cd799439011';
  let subcategoryId: string;
  let budgetId: string;
  let accountId: string;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Resources created during the run, deleted in afterAll so the shared DB stays clean
  const createdTransactionIds: string[] = [];

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

    const account = await request(app.getHttpServer())
      .post('/bank-account')
      .set('Authorization', authToken)
      .send({ description: 'Budget E2E Test Account', balance: 0 });
    accountId = account.body.id;

    const subcategory = await request(app.getHttpServer())
      .post('/subcategory')
      .set('Authorization', authToken)
      .send({
        name: 'Budget E2E Test Subcategory',
        description: 'test',
        categoryId,
      });
    subcategoryId = subcategory.body.id;
  });

  afterAll(async () => {
    for (const id of createdTransactionIds) {
      await request(app.getHttpServer())
        .delete(`/transaction/${id}`)
        .set('Authorization', authToken);
    }
    if (budgetId) {
      await request(app.getHttpServer())
        .delete(`/budget/${budgetId}`)
        .set('Authorization', authToken);
    }
    if (subcategoryId) {
      await request(app.getHttpServer())
        .delete(`/subcategory/${subcategoryId}`)
        .set('Authorization', authToken);
    }
    if (accountId) {
      await request(app.getHttpServer())
        .delete(`/bank-account/${accountId}`)
        .set('Authorization', authToken);
    }
    await app.close();
  });

  describe('Budget CRUD Operations', () => {
    it('should create a budget', async () => {
      const response = await request(app.getHttpServer())
        .post('/budget')
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: currentMonth,
          amount: 100,
          rolloverPolicy: 'no_rollover',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.amount).toBe(100);
      expect(response.body.spent).toBe(0);
      expect(response.body.month).toBe(currentMonth);
      expect(response.body.created_by).toBe(userId);
      budgetId = response.body.id;
    });

    it('should retrieve budget by month', async () => {
      const response = await request(app.getHttpServer())
        .get(`/budget/by-month?month=${currentMonth}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0].month).toBe(currentMonth);
    });

    it('should retrieve single budget with alerts', async () => {
      const response = await request(app.getHttpServer())
        .get(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.id).toBe(budgetId);
      expect(response.body).toHaveProperty('alerts');
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });

    it('should update budget amount', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .send({
          amount: 150,
        })
        .expect(200);

      expect(response.body.amount).toBe(150);
      expect(response.body.updated_by).toBe(userId);
    });

    it('should return 400 for invalid month format in create', async () => {
      await request(app.getHttpServer())
        .post('/budget')
        .set('Authorization', authToken)
        .send({
          categoryId,
          month: '2024/01', // Invalid format
          amount: 100,
        })
        .expect(400);
    });
  });

  describe('Budget Threshold Alerts', () => {
    it('should NOT fire alert when spending is below 90%', async () => {
      // Budget is 150, create transaction for 50 (33%)
      const response = await request(app.getHttpServer())
        .post('/transaction')
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 50,
          account_id: accountId,
          subcategory_id: subcategoryId,
          user_id: userId,
        })
        .expect(201);
      createdTransactionIds.push(response.body.id);

      const budgetResponse = await request(app.getHttpServer())
        .get(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(budgetResponse.body.spent).toBeLessThan(
        budgetResponse.body.amount * 0.9,
      );
      expect(budgetResponse.body.alerts.length).toBe(0);
    });

    it('should fire WARNING alert at 90% threshold', async () => {
      // Budget is 150, need to reach 135 (90%)
      // Already have 50 spent, add 85 more to reach 135
      const response = await request(app.getHttpServer())
        .post('/transaction')
        .set('Authorization', authToken)
        .send({
          type: 'expense',
          amount: 85,
          account_id: accountId,
          subcategory_id: subcategoryId,
          user_id: userId,
        })
        .expect(201);
      createdTransactionIds.push(response.body.id);

      const budgetResponse = await request(app.getHttpServer())
        .get(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      const percentUsed =
        (budgetResponse.body.spent / budgetResponse.body.amount) * 100;
      expect(percentUsed).toBeGreaterThanOrEqual(90);

      const warningAlert = budgetResponse.body.alerts.find(
        (a) => a.alertLevel === 'warning',
      );
      expect(warningAlert).toBeDefined();
      expect(warningAlert.acknowledged).toBe(false);
    });

    it('should acknowledge budget alert', async () => {
      const budgetResponse = await request(app.getHttpServer())
        .get(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      const alert = budgetResponse.body.alerts[0];
      expect(alert).toBeDefined();

      await request(app.getHttpServer())
        .patch(`/budget/alert/${alert.id}/acknowledge`)
        .set('Authorization', authToken)
        .expect(200);

      const updatedBudget = await request(app.getHttpServer())
        .get(`/budget/${budgetId}`)
        .set('Authorization', authToken)
        .expect(200);

      const updatedAlert = updatedBudget.body.alerts.find(
        (a) => a.id === alert.id,
      );
      expect(updatedAlert.acknowledged).toBe(true);
    });
  });

  describe('Budget Reporting', () => {
    it('should generate monthly report', async () => {
      const response = await request(app.getHttpServer())
        .get(`/budget/report/monthly?month=${currentMonth}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('budgets');
      expect(response.body).toHaveProperty('totalBudget');
      expect(response.body).toHaveProperty('totalSpent');
      expect(response.body).toHaveProperty('remaining');
      expect(response.body).toHaveProperty('percentageUsed');
      expect(response.body).toHaveProperty('alerts');
      expect(Array.isArray(response.body.budgets)).toBe(true);
      expect(response.body.totalBudget).toBeGreaterThan(0);
    });

    it('should return spending trend for last 6 months', async () => {
      const response = await request(app.getHttpServer())
        .get('/budget/report/trend')
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(6);

      // Each month should have trend data
      response.body.forEach((month) => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('totalBudget');
        expect(month).toHaveProperty('totalSpent');
        expect(month).toHaveProperty('percentageUsed');
      });
    });
  });

  describe('Multiple Budgets Same Month', () => {
    let budgetId2: string;
    const categoryId2 = '507f191e810c19729de860ea';

    it('should create second budget for different category', async () => {
      const response = await request(app.getHttpServer())
        .post('/budget')
        .set('Authorization', authToken)
        .send({
          categoryId: categoryId2,
          month: currentMonth,
          amount: 200,
          rolloverPolicy: 'carry_balance',
        })
        .expect(201);

      expect(response.body.amount).toBe(200);
      expect(response.body.rolloverPolicy).toBe('carry_balance');
      budgetId2 = response.body.id;
    });

    it('should list both budgets for month', async () => {
      const response = await request(app.getHttpServer())
        .get(`/budget/by-month?month=${currentMonth}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
      const budgetIds = response.body.map((b) => b.id);
      expect(budgetIds).toContain(budgetId);
      expect(budgetIds).toContain(budgetId2);
    });

    it('should generate report with both budgets', async () => {
      const response = await request(app.getHttpServer())
        .get(`/budget/report/monthly?month=${currentMonth}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.budgets.length).toBeGreaterThanOrEqual(2);
      const thisRunBudgetTotal = response.body.budgets
        .filter((b) => b.id === budgetId || b.id === budgetId2)
        .reduce((sum, b) => sum + b.amount, 0);
      expect(thisRunBudgetTotal).toBe(350); // 150 + 200
    });

    it('should delete second budget', async () => {
      await request(app.getHttpServer())
        .delete(`/budget/${budgetId2}`)
        .set('Authorization', authToken)
        .expect(200);

      // Verify deletion
      await request(app.getHttpServer())
        .get(`/budget/${budgetId2}`)
        .set('Authorization', authToken)
        .expect(404);
    });
  });

  describe('Authorization & Error Handling', () => {
    it('should reject request without authorization', async () => {
      await request(app.getHttpServer())
        .get(`/budget/by-month?month=${currentMonth}`)
        .expect(403);
    });

    it('should return 400 for invalid budget ID', async () => {
      await request(app.getHttpServer())
        .get('/budget/invalid-id')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 404 for non-existent budget', async () => {
      await request(app.getHttpServer())
        .get('/budget/507f1f77bcf86cd799439099')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 400 for missing month query param', async () => {
      await request(app.getHttpServer())
        .get('/budget/by-month')
        .set('Authorization', authToken)
        .expect(400);
    });
  });
});
