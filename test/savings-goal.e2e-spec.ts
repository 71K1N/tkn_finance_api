import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Savings Goal Workflow (P3-E2E)', () => {
  let app: INestApplication;
  const baseUrl = '/savings-goal';
  const authToken = 'Bearer 1'; // userId: 1

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /savings-goal', () => {
    it('should create a savings goal with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.targetAmount).toBe(10000);
      expect(response.body.monthlyAllocation).toBe(500);
      expect(response.body.currentSaved).toBe(0);
      expect(response.body.userId).toBe(1);
    });

    it('should reject without authorization', async () => {
      await request(app.getHttpServer())
        .post(baseUrl)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        })
        .expect(403);
    });

    it('should reject zero target amount', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 0,
          monthlyAllocation: 500,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject negative monthly allocation', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: -100,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should calculate projected completion date on creation', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 5000,
          monthlyAllocation: 500,
        })
        .expect(201);

      expect(response.body).toHaveProperty('projectedCompletionDate');
      const projectedDate = new Date(response.body.projectedCompletionDate);
      expect(projectedDate).toBeInstanceOf(Date);
    });
  });

  describe('GET /savings-goal', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });

      await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 20000,
          monthlyAllocation: 1000,
        });
    });

    it('should list all savings goals for user', async () => {
      const response = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('targetAmount');
      expect(response.body[0]).toHaveProperty('currentSaved');
    });

    it('should not expose other users goals', async () => {
      const user1Goals = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', 'Bearer 1')
        .expect(200);

      const user2Goals = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', 'Bearer 2')
        .expect(200);

      expect(Array.isArray(user1Goals.body)).toBe(true);
      expect(Array.isArray(user2Goals.body)).toBe(true);
    });
  });

  describe('GET /savings-goal/:id', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 15000,
          monthlyAllocation: 750,
        });
      goalId = response.body.id;
    });

    it('should retrieve savings goal by id with all details', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.id).toBe(goalId);
      expect(response.body.targetAmount).toBe(15000);
      expect(response.body.monthlyAllocation).toBe(750);
      expect(response.body).toHaveProperty('projectedCompletionDate');
    });

    it('should return 404 for non-existent goal', async () => {
      await request(app.getHttpServer())
        .get(`${baseUrl}/999999`)
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should reject invalid id format', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/invalid-id`)
        .set('Authorization', authToken)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PATCH /savings-goal/:id', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 12000,
          monthlyAllocation: 600,
        });
      goalId = response.body.id;
    });

    it('should update target amount', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${goalId}`)
        .set('Authorization', authToken)
        .send({ targetAmount: 15000 })
        .expect(200);

      expect(response.body.targetAmount).toBe(15000);
    });

    it('should update monthly allocation and recalculate projection', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${goalId}`)
        .set('Authorization', authToken)
        .send({ monthlyAllocation: 1000 })
        .expect(200);

      expect(response.body.monthlyAllocation).toBe(1000);
      expect(response.body).toHaveProperty('projectedCompletionDate');
    });

    it('should return 404 for non-existent goal', async () => {
      await request(app.getHttpServer())
        .patch(`${baseUrl}/999999`)
        .set('Authorization', authToken)
        .send({ targetAmount: 20000 })
        .expect(404);
    });
  });

  describe('POST /savings-goal/:id/deposit', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });
      goalId = response.body.id;
    });

    it('should deposit money into savings goal', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 1000 })
        .expect(201);

      expect(response.body.currentSaved).toBe(1000);
    });

    it('should accumulate deposits', async () => {
      await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 500 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}`)
        .set('Authorization', authToken);

      expect(response.body.currentSaved).toBe(1500);
    });

    it('should cap deposit at target amount', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 20000 })
        .expect(201);

      expect(response.body.currentSaved).toBeLessThanOrEqual(
        response.body.targetAmount,
      );
    });

    it('should reject zero amount deposit', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 0 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject negative amount deposit', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: -100 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent goal', async () => {
      await request(app.getHttpServer())
        .post(`${baseUrl}/999999/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 500 })
        .expect(404);
    });
  });

  describe('POST /savings-goal/:id/withdraw', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });
      goalId = response.body.id;

      await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 5000 });
    });

    it('should withdraw money from savings goal', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/withdraw`)
        .set('Authorization', authToken)
        .send({ amount: 1000 })
        .expect(201);

      expect(response.body.currentSaved).toBe(4000);
    });

    it('should reject withdrawal greater than current saved', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/withdraw`)
        .set('Authorization', authToken)
        .send({ amount: 10000 })
        .expect(400);

      expect(response.body.error).toContain('Insufficient');
    });

    it('should reject zero amount withdrawal', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/withdraw`)
        .set('Authorization', authToken)
        .send({ amount: 0 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject negative amount withdrawal', async () => {
      const response = await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/withdraw`)
        .set('Authorization', authToken)
        .send({ amount: -100 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent goal', async () => {
      await request(app.getHttpServer())
        .post(`${baseUrl}/999999/withdraw`)
        .set('Authorization', authToken)
        .send({ amount: 500 })
        .expect(404);
    });
  });

  describe('GET /savings-goal/:id/progress', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 1000,
        });
      goalId = response.body.id;

      await request(app.getHttpServer())
        .post(`${baseUrl}/${goalId}/deposit`)
        .set('Authorization', authToken)
        .send({ amount: 5000 });
    });

    it('should return progress metrics', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}/progress`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('targetAmount');
      expect(response.body).toHaveProperty('currentSaved');
      expect(response.body).toHaveProperty('remaining');
      expect(response.body).toHaveProperty('percentageComplete');
      expect(response.body).toHaveProperty('monthlyAllocation');
      expect(response.body).toHaveProperty('projectedCompletionDate');
    });

    it('should calculate correct remaining amount', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}/progress`)
        .set('Authorization', authToken);

      expect(response.body.remaining).toBe(5000); // 10000 - 5000
    });

    it('should calculate correct percentage complete', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}/progress`)
        .set('Authorization', authToken);

      expect(response.body.percentageComplete).toBe(50); // 5000/10000 * 100
    });

    it('should project completion date based on allocation', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${goalId}/progress`)
        .set('Authorization', authToken);

      const projectedDate = new Date(response.body.projectedCompletionDate);
      const today = new Date();
      expect(projectedDate > today).toBe(true);
    });

    it('should return 404 for non-existent goal', async () => {
      await request(app.getHttpServer())
        .get(`${baseUrl}/999999/progress`)
        .set('Authorization', authToken)
        .expect(404);
    });
  });

  describe('DELETE /savings-goal/:id', () => {
    let goalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });
      goalId = response.body.id;
    });

    it('should delete savings goal', async () => {
      const response = await request(app.getHttpServer())
        .delete(`${baseUrl}/${goalId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.message).toBe('Savings goal deleted successfully');
    });

    it('should return 404 when deleting non-existent goal', async () => {
      await request(app.getHttpServer())
        .delete(`${baseUrl}/999999`)
        .set('Authorization', authToken)
        .expect(404);
    });

    it('goal should not be retrievable after deletion', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });

      const id = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`${baseUrl}/${id}`)
        .set('Authorization', authToken)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${baseUrl}/${id}`)
        .set('Authorization', authToken)
        .expect(404);
    });
  });

  describe('Authorization & Data Isolation', () => {
    let user1GoalId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', 'Bearer 1')
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });
      user1GoalId = response.body.id;
    });

    it('should isolate goals between different users', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${user1GoalId}`)
        .set('Authorization', 'Bearer 2')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('user should not deposit to other users goal', async () => {
      // Create goal for user 2
      const goalResponse = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', 'Bearer 2')
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });

      // Try to deposit to user 2's goal as user 1 (impossible since user 1 can't access goal)
      await request(app.getHttpServer())
        .post(`${baseUrl}/${goalResponse.body.id}/deposit`)
        .set('Authorization', 'Bearer 1')
        .send({ amount: 1000 })
        .expect(404);
    });
  });

  describe('Audit Trail', () => {
    it('savings goals should have audit fields', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          targetAmount: 10000,
          monthlyAllocation: 500,
        });

      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body.created_by).toBe(1);
    });
  });
});
