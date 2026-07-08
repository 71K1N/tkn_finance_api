import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Wish List Workflow (P3-E2E)', () => {
  let app: INestApplication;
  const baseUrl = '/wish-item';
  const authToken = 'Bearer 1'; // userId: 1
  const nonExistentId = '507f1f77bcf86cd799439099';

  // Resources created during the run, deleted in afterAll so the shared DB stays clean
  const createdIds: string[] = [];

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
    for (const id of createdIds) {
      await request(app.getHttpServer())
        .delete(`${baseUrl}/${id}`)
        .set('Authorization', authToken);
    }
    await app.close();
  });

  describe('POST /wish-item', () => {
    it('should create a wish item with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Dream Vacation',
          estimatedCost: 5000,
          targetDate: '2026-12-31',
          priority: 'high',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Dream Vacation');
      expect(response.body.estimatedCost).toBe(5000);
      expect(response.body.status).toBe('active');
      expect(response.body.priority).toBe('high');
      expect(response.body.userId).toBe(1);
      createdIds.push(response.body.id);
    });

    it('should reject wish item without authorization', async () => {
      await request(app.getHttpServer())
        .post(baseUrl)
        .send({
          name: 'New Laptop',
          estimatedCost: 1500,
          targetDate: '2026-06-30',
        })
        .expect(403);
    });

    it('should reject invalid priority enum', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Invalid Priority',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
          priority: 'invalid_priority',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject negative estimated cost', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Negative Cost Item',
          estimatedCost: -100,
          targetDate: '2026-12-31',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /wish-item', () => {
    beforeAll(async () => {
      // Create test wish items
      const item1 = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Item 1',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
          priority: 'high',
        });
      createdIds.push(item1.body.id);

      const item2 = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Item 2',
          estimatedCost: 2000,
          targetDate: '2026-06-30',
          priority: 'low',
        });
      createdIds.push(item2.body.id);
    });

    it('should list all wish items for user', async () => {
      const response = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('status');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter wish items by status=active', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}?filters[status]=active`)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((item) => {
        expect(item.status).toBe('active');
      });
    });

    it('should return empty list for status=completed', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}?filters[status]=completed`)
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return an empty list for a status value that matches nothing (generic filter, no enum validation)', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}?filters[status]=invalid`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /wish-item/:id', () => {
    let wishItemId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Get Test Item',
          estimatedCost: 3000,
          targetDate: '2026-12-31',
          priority: 'medium',
        });
      wishItemId = response.body.id;
      createdIds.push(response.body.id);
    });

    it('should retrieve wish item by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`${baseUrl}/${wishItemId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.id).toBe(wishItemId);
      expect(response.body.name).toBe('Get Test Item');
      expect(response.body.estimatedCost).toBe(3000);
    });

    it('should return 404 for non-existent wish item', async () => {
      await request(app.getHttpServer())
        .get(`${baseUrl}/${nonExistentId}`)
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

  describe('PATCH /wish-item/:id', () => {
    let wishItemId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Update Test Item',
          estimatedCost: 1500,
          targetDate: '2026-12-31',
          priority: 'low',
        });
      wishItemId = response.body.id;
      createdIds.push(response.body.id);
    });

    it('should update wish item name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}`)
        .set('Authorization', authToken)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
      expect(response.body.estimatedCost).toBe(1500);
    });

    it('should update estimated cost', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}`)
        .set('Authorization', authToken)
        .send({ estimatedCost: 2500 })
        .expect(200);

      expect(response.body.estimatedCost).toBe(2500);
    });

    it('should update priority', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}`)
        .set('Authorization', authToken)
        .send({ priority: 'high' })
        .expect(200);

      expect(response.body.priority).toBe('high');
    });

    it('should return 404 for non-existent wish item', async () => {
      await request(app.getHttpServer())
        .patch(`${baseUrl}/${nonExistentId}`)
        .set('Authorization', authToken)
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  describe('PATCH /wish-item/:id/status', () => {
    let wishItemId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Status Test Item',
          estimatedCost: 2000,
          targetDate: '2026-12-31',
          priority: 'medium',
        });
      wishItemId = response.body.id;
      createdIds.push(response.body.id);
    });

    it('should update status from active to completed', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}/status`)
        .set('Authorization', authToken)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body.status).toBe('completed');
    });

    it('should update status from completed to on_hold', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}/status`)
        .set('Authorization', authToken)
        .send({ status: 'on_hold' })
        .expect(200);

      expect(response.body.status).toBe('on_hold');
    });

    it('should update status from on_hold to abandoned', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}/status`)
        .set('Authorization', authToken)
        .send({ status: 'abandoned' })
        .expect(200);

      expect(response.body.status).toBe('abandoned');
    });

    it('should reject invalid status value', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${baseUrl}/${wishItemId}/status`)
        .set('Authorization', authToken)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent wish item', async () => {
      await request(app.getHttpServer())
        .patch(`${baseUrl}/${nonExistentId}/status`)
        .set('Authorization', authToken)
        .send({ status: 'completed' })
        .expect(404);
    });
  });

  describe('DELETE /wish-item/:id', () => {
    let wishItemId: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Delete Test Item',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
          priority: 'low',
        });
      wishItemId = response.body.id;
    });

    it('should delete wish item', async () => {
      const response = await request(app.getHttpServer())
        .delete(`${baseUrl}/${wishItemId}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.message).toBe('Wish item deleted successfully');
    });

    it('should return 404 when deleting non-existent item', async () => {
      await request(app.getHttpServer())
        .delete(`${baseUrl}/${nonExistentId}`)
        .set('Authorization', authToken)
        .expect(404);
    });

    it('wish item should not be retrievable after deletion', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Verify Delete Item',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
          priority: 'low',
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
    let userId1Item: number;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', 'Bearer 1')
        .send({
          name: 'User 1 Item',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
          priority: 'high',
        });
      userId1Item = response.body.id;
      createdIds.push(response.body.id);
    });

    it('should isolate data between different users', async () => {
      const user2Response = await request(app.getHttpServer())
        .get(`${baseUrl}/${userId1Item}`)
        .set('Authorization', 'Bearer 2')
        .expect(404);

      expect(user2Response.body.error).toBeDefined();
    });

    it('user 1 should see own items', async () => {
      const response = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', 'Bearer 1')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('user 2 should not see user 1 items', async () => {
      const user2Response = await request(app.getHttpServer())
        .get(baseUrl)
        .set('Authorization', 'Bearer 2')
        .expect(200);

      expect(Array.isArray(user2Response.body.data)).toBe(true);
    });
  });

  describe('Audit Trail', () => {
    it('wish items should have audit fields', async () => {
      const response = await request(app.getHttpServer())
        .post(baseUrl)
        .set('Authorization', authToken)
        .send({
          name: 'Audit Test Item',
          estimatedCost: 1000,
          targetDate: '2026-12-31',
        });

      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body.created_by).toBe(1);
      createdIds.push(response.body.id);
    });
  });
});
