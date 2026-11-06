import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('P1 Core Flow (e2e)', () => {
  let app: INestApplication;
  const authToken = `Bearer ${1}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates accounts, performs deposit, withdrawal and transfer atomically', async () => {
    // Create account A
    const createA = await request(app.getHttpServer())
      .post('/bank-account')
      .set('Authorization', authToken)
      .send({ name: 'Account A', description: 'Primary account', balance: 0 });
    expect(createA.status).toBe(201);
    const accountA = createA.body;

    // Create account B
    const createB = await request(app.getHttpServer())
      .post('/bank-account')
      .set('Authorization', authToken)
      .send({
        name: 'Account B',
        description: 'Secondary account',
        balance: 0,
      });
    expect(createB.status).toBe(201);
    const accountB = createB.body;

    try {
      // Deposit into A (income) — balance only moves once the transaction is paid/received
      const deposit = await request(app.getHttpServer())
        .post('/transaction')
        .set('Authorization', authToken)
        .send({
          name: 'Deposit',
          account_id: accountA.id,
          due_date: new Date().toISOString().split('T')[0],
          amount: 100,
          type: 'income',
          description: 'Initial deposit',
          user_id: 1,
        });
      expect(deposit.status).toBe(201);

      await request(app.getHttpServer())
        .post(`/transaction/${deposit.body.id}/payment`)
        .set('Authorization', authToken)
        .send({ paid_amount: 100 })
        .expect(201);

      // Check balance A
      const balA1 = await request(app.getHttpServer())
        .get(`/bank-account/${accountA.id}/balance`)
        .set('Authorization', authToken);
      expect(balA1.status).toBe(200);
      expect(balA1.body.balance).toBe(100);

      // Withdraw 30 from A (expense)
      const withdraw = await request(app.getHttpServer())
        .post('/transaction')
        .set('Authorization', authToken)
        .send({
          name: 'Withdraw',
          account_id: accountA.id,
          due_date: new Date().toISOString().split('T')[0],
          amount: 30,
          type: 'expense',
          description: 'Buy stuff',
          user_id: 1,
        });
      expect(withdraw.status).toBe(201);

      await request(app.getHttpServer())
        .post(`/transaction/${withdraw.body.id}/payment`)
        .set('Authorization', authToken)
        .send({ paid_amount: 30 })
        .expect(201);

      // Check balance A
      const balA2 = await request(app.getHttpServer())
        .get(`/bank-account/${accountA.id}/balance`)
        .set('Authorization', authToken);
      expect(balA2.status).toBe(200);
      expect(balA2.body.balance).toBe(70);

      // Transfer 50 from A to B — transfers move balance immediately at creation
      const transfer = await request(app.getHttpServer())
        .post('/transaction')
        .set('Authorization', authToken)
        .send({
          name: 'Transfer Out',
          account_id: accountA.id,
          due_date: new Date().toISOString().split('T')[0],
          target_account_id: accountB.id,
          amount: 50,
          type: 'transfer',
          description: 'Move to B',
          user_id: 1,
        });
      expect(transfer.status).toBe(201);

      // Check balances A and B
      const balA3 = await request(app.getHttpServer())
        .get(`/bank-account/${accountA.id}/balance`)
        .set('Authorization', authToken);
      const balB1 = await request(app.getHttpServer())
        .get(`/bank-account/${accountB.id}/balance`)
        .set('Authorization', authToken);
      expect(balA3.status).toBe(200);
      expect(balB1.status).toBe(200);
      expect(balA3.body.balance).toBe(20);
      expect(balB1.body.balance).toBe(50);

      // Ensure transactions are listed for account A
      const txsA = await request(app.getHttpServer())
        .get(`/bank-account/${accountA.id}/transactions`)
        .set('Authorization', authToken);
      expect(txsA.status).toBe(200);
      expect(Array.isArray(txsA.body)).toBe(true);
      expect(txsA.body.length).toBeGreaterThanOrEqual(3);
    } finally {
      // Clean up so this run doesn't leave test accounts/transactions in the shared DB
      const txsA = await request(app.getHttpServer())
        .get(`/bank-account/${accountA.id}/transactions`)
        .set('Authorization', authToken);
      const txsB = await request(app.getHttpServer())
        .get(`/bank-account/${accountB.id}/transactions`)
        .set('Authorization', authToken);
      const allTxIds = new Set([
        ...(Array.isArray(txsA.body) ? txsA.body.map((t) => t.id) : []),
        ...(Array.isArray(txsB.body) ? txsB.body.map((t) => t.id) : []),
      ]);
      for (const txId of allTxIds) {
        await request(app.getHttpServer())
          .delete(`/transaction/${txId}`)
          .set('Authorization', authToken);
      }
      await request(app.getHttpServer())
        .delete(`/bank-account/${accountA.id}`)
        .set('Authorization', authToken);
      await request(app.getHttpServer())
        .delete(`/bank-account/${accountB.id}`)
        .set('Authorization', authToken);
    }
  }, 20000);
});
