import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Reporting Endpoints Load Testing (P2-E2E)', () => {
  let app: INestApplication;
  const budgetBaseUrl = '/budget';
  const transactionBaseUrl = '/transaction';
  const bankAccountBaseUrl = '/bank-account';
  const authToken = 'Bearer load-test-user';
  let bankAccountId: number;
  let categoryId: number;
  let subcategoryId: number;
  const performanceMetrics = {
    monthlyReportTimes: [] as number[],
    trendReportTimes: [] as number[],
    listBudgetsTimes: [] as number[],
  };

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

    // Create bank account
    const accountResponse = await request(app.getHttpServer())
      .post(bankAccountBaseUrl)
      .set('Authorization', authToken)
      .send({
        description: 'Load Test Account',
        balance: 1000000, // High balance to support transactions
      });
    bankAccountId = accountResponse.body.id;

    // Create category
    const categoryResponse = await request(app.getHttpServer())
      .post('/category')
      .set('Authorization', authToken)
      .send({ name: 'Load Test Category', description: 'For load testing' });
    categoryId = categoryResponse.body.id;

    // Create subcategory
    const subcategoryResponse = await request(app.getHttpServer())
      .post('/subcategory')
      .set('Authorization', authToken)
      .send({
        name: 'Load Test Subcategory',
        description: 'For load testing',
        categoryId,
      });
    subcategoryId = subcategoryResponse.body.id;

    // Create multiple budgets for multiple months
    console.log('Setting up load test data: Creating 12 budgets (one per month)...');
    for (let i = 1; i <= 12; i++) {
      const month = `2025-${String(i).padStart(2, '0')}`;
      await request(app.getHttpServer())
        .post(budgetBaseUrl)
        .set('Authorization', authToken)
        .send({
          categoryId,
          month,
          amount: 5000 + i * 100,
          rolloverPolicy: 'no_rollover',
        })
        .expect(201);
    }

    // Create multiple transactions for each month to simulate real data
    console.log('Creating 500+ transactions across all months...');
    let transactionCount = 0;
    for (let month = 1; month <= 12; month++) {
      // Create 40-50 transactions per month
      const transactionsPerMonth = 40 + Math.floor(Math.random() * 10);
      for (let t = 0; t < transactionsPerMonth; t++) {
        const amount = 10 + Math.random() * 490; // Random amount between 10-500
        await request(app.getHttpServer())
          .post(transactionBaseUrl)
          .set('Authorization', authToken)
          .send({
            type: 'expense',
            amount: parseFloat(amount.toFixed(2)),
            bankAccountId,
            subcategoryId,
            description: `Load test transaction ${transactionCount + 1}`,
          })
          .expect(201);
        transactionCount++;
      }
    }
    console.log(`Load test setup complete: ${transactionCount} transactions created`);
  });

  afterAll(async () => {
    await app.close();

    // Print performance summary
    console.log('\n=== PERFORMANCE METRICS SUMMARY ===');
    console.log(
      'Monthly Report Response Times:',
      performanceMetrics.monthlyReportTimes,
    );
    console.log(
      'Average Monthly Report Time:',
      (
        performanceMetrics.monthlyReportTimes.reduce((a, b) => a + b, 0) /
        performanceMetrics.monthlyReportTimes.length
      ).toFixed(2) + 'ms',
    );

    console.log('\nTrend Report Response Times:', performanceMetrics.trendReportTimes);
    console.log(
      'Average Trend Report Time:',
      (
        performanceMetrics.trendReportTimes.reduce((a, b) => a + b, 0) /
        performanceMetrics.trendReportTimes.length
      ).toFixed(2) + 'ms',
    );

    console.log('\nList Budgets Response Times:', performanceMetrics.listBudgetsTimes);
    console.log(
      'Average List Budgets Time:',
      (
        performanceMetrics.listBudgetsTimes.reduce((a, b) => a + b, 0) /
        performanceMetrics.listBudgetsTimes.length
      ).toFixed(2) + 'ms',
    );

    // Calculate percentiles
    const sorted = performanceMetrics.monthlyReportTimes.sort((a, b) => a - b);
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p99Index = Math.ceil(sorted.length * 0.99) - 1;
    console.log('\nMonthly Report P95:', sorted[p95Index] + 'ms');
    console.log('Monthly Report P99:', sorted[p99Index] + 'ms');
  });

  describe('Monthly Report Performance (Target: <500ms)', () => {
    it('should return monthly report for current month within acceptable time', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/monthly?month=2025-01`)
        .set('Authorization', authToken)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      performanceMetrics.monthlyReportTimes.push(responseTime);

      console.log(`Monthly report (2025-01) response time: ${responseTime}ms`);

      // Performance assertion: should respond under 500ms
      expect(responseTime).toBeLessThan(500);

      // Validate response structure
      expect(response.body).toHaveProperty('month', '2025-01');
      expect(response.body).toHaveProperty('totalBudgeted');
      expect(response.body).toHaveProperty('totalSpent');
      expect(response.body).toHaveProperty('totalRemaining');
      expect(response.body).toHaveProperty('budgets');
      expect(Array.isArray(response.body.budgets)).toBe(true);
    });

    it('should return monthly report for various months consistently', async () => {
      const months = ['2025-03', '2025-06', '2025-09', '2025-12'];

      for (const month of months) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get(`${budgetBaseUrl}/report/monthly?month=${month}`)
          .set('Authorization', authToken)
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        performanceMetrics.monthlyReportTimes.push(responseTime);

        console.log(`Monthly report (${month}) response time: ${responseTime}ms`);
        expect(responseTime).toBeLessThan(500);
      }
    });
  });

  describe('Trend Report Performance (Target: <750ms)', () => {
    it('should return 12-month trend report within acceptable time', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/trend`)
        .set('Authorization', authToken)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      performanceMetrics.trendReportTimes.push(responseTime);

      console.log(`Trend report response time: ${responseTime}ms`);

      // Performance assertion: trend report should respond under 750ms
      expect(responseTime).toBeLessThan(750);

      // Validate response structure
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      response.body.forEach((monthData) => {
        expect(monthData).toHaveProperty('month');
        expect(monthData).toHaveProperty('totalBudgeted');
        expect(monthData).toHaveProperty('totalSpent');
        expect(monthData).toHaveProperty('budgetCount');
      });
    });

    it('should handle multiple concurrent trend report requests', async () => {
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const startTime = Date.now();
        const promise = request(app.getHttpServer())
          .get(`${budgetBaseUrl}/report/trend`)
          .set('Authorization', authToken)
          .then((response) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            performanceMetrics.trendReportTimes.push(responseTime);
            console.log(
              `Concurrent trend report ${i + 1} response time: ${responseTime}ms`,
            );
            expect(response.status).toBe(200);
            return responseTime;
          });
        promises.push(promise);
      }

      const responseTimes = await Promise.all(promises);
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      console.log(`Average concurrent response time: ${avgTime.toFixed(2)}ms`);

      // Average should still be acceptable even with concurrency
      expect(avgTime).toBeLessThan(1000);
    });
  });

  describe('List Budgets Performance', () => {
    it('should list all budgets efficiently with month filter', async () => {
      const months = ['2025-01', '2025-06', '2025-12'];

      for (const month of months) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get(`${budgetBaseUrl}?month=${month}`)
          .set('Authorization', authToken)
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        performanceMetrics.listBudgetsTimes.push(responseTime);

        console.log(`List budgets (${month}) response time: ${responseTime}ms`);

        // List budgets should be very fast (typically <100ms)
        expect(responseTime).toBeLessThan(300);
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('should list all budgets across all months', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}`)
        .set('Authorization', authToken)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      performanceMetrics.listBudgetsTimes.push(responseTime);

      console.log(`List all budgets response time: ${responseTime}ms`);

      expect(responseTime).toBeLessThan(300);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(12); // At least 12 months
    });
  });

  describe('Large Result Set Handling', () => {
    it('should efficiently handle monthly report with 50+ transactions', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/monthly?month=2025-06`)
        .set('Authorization', authToken)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      console.log(`Large result set response time: ${responseTime}ms`);

      // Should still be fast even with large data
      expect(responseTime).toBeLessThan(750);

      // Verify complete data is returned
      expect(response.body).toHaveProperty('budgets');
      expect(response.body.budgets.length).toBeGreaterThan(0);

      // Each budget should have complete structure
      response.body.budgets.forEach((budget) => {
        expect(budget).toHaveProperty('id');
        expect(budget).toHaveProperty('spent');
        expect(budget).toHaveProperty('amount');
      });
    });
  });

  describe('Concurrent Load Test', () => {
    it('should handle multiple concurrent monthly report requests', async () => {
      const concurrentRequests = 10;
      const promises = [];
      const localMetrics = [] as number[];

      for (let i = 0; i < concurrentRequests; i++) {
        const month = `2025-${String((i % 12) + 1).padStart(2, '0')}`;
        const startTime = Date.now();

        const promise = request(app.getHttpServer())
          .get(`${budgetBaseUrl}/report/monthly?month=${month}`)
          .set('Authorization', authToken)
          .then((response) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            localMetrics.push(responseTime);
            performanceMetrics.monthlyReportTimes.push(responseTime);
            console.log(`Concurrent monthly report response time: ${responseTime}ms`);
            expect(response.status).toBe(200);
            return responseTime;
          });

        promises.push(promise);
      }

      const responseTimes = await Promise.all(promises);
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);

      console.log(`Average concurrent response time: ${avgTime.toFixed(2)}ms`);
      console.log(`Max concurrent response time: ${maxTime}ms`);

      // Under load, average should still be reasonable
      expect(avgTime).toBeLessThan(1000);
      // Max should not exceed 2x the target
      expect(maxTime).toBeLessThan(1000);
    });
  });

  describe('Query Optimization Validation', () => {
    it('subsequent calls should not significantly increase in response time', async () => {
      const callCount = 5;
      const responseTimes = [];

      for (let i = 0; i < callCount; i++) {
        const startTime = Date.now();

        await request(app.getHttpServer())
          .get(`${budgetBaseUrl}/report/trend`)
          .set('Authorization', authToken)
          .expect(200);

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      console.log('Subsequent call times:', responseTimes);

      // First call might be slower due to warm-up, but subsequent calls should be consistent
      const avgFirstTwo = (responseTimes[0] + responseTimes[1]) / 2;
      const avgLastTwo = (responseTimes[callCount - 2] + responseTimes[callCount - 1]) / 2;

      // Last calls should not be significantly slower than first calls
      expect(avgLastTwo).toBeLessThan(avgFirstTwo * 1.5);
    });
  });

  describe('Error Handling Under Load', () => {
    it('should handle invalid month format gracefully', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/monthly?month=invalid`)
        .set('Authorization', authToken)
        .expect(400);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      console.log(`Error handling response time: ${responseTime}ms`);

      // Error responses should be fast
      expect(responseTime).toBeLessThan(100);
    });

    it('should handle authorization failures quickly', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get(`${budgetBaseUrl}/report/monthly?month=2025-01`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      console.log(`Authorization failure response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(100);
    });
  });
});
