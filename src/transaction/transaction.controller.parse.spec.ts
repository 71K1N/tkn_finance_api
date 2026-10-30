import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TransactionParserService } from './transaction-parser.service';

const USER_ID = 7;
const DRAFT = {
  name: 'Mercado',
  amount: 87.5,
  type: 'EXPENSE',
  payment_date: '2026-03-09',
  subcategory_id: null,
  account_id: null,
};

describe('POST /transaction/parse', () => {
  let app: INestApplication;
  let parserService: { parse: jest.Mock };
  let transactionService: Record<string, jest.Mock>;

  beforeEach(async () => {
    parserService = { parse: jest.fn().mockResolvedValue(DRAFT) };
    transactionService = { create: jest.fn(), update: jest.fn() };

    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      controllers: [TransactionController],
      providers: [
        { provide: TransactionService, useValue: transactionService },
        { provide: TransactionParserService, useValue: parserService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    // Stand-in for JwtAuthGuard, which sets request.user for @User().
    app.use((req: any, _res: unknown, next: () => void) => {
      req.user = { id: USER_ID };
      next();
    });
    await app.init();
  });

  afterEach(() => app.close());

  it('returns 200 with the draft and parses for the authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .post('/transaction/parse')
      .send({ text: '  mercado 87,50 ontem ' })
      .expect(200);

    expect(res.body).toEqual(DRAFT);
    expect(parserService.parse).toHaveBeenCalledWith(
      USER_ID,
      'mercado 87,50 ontem',
    );
  });

  it('saves nothing', async () => {
    await request(app.getHttpServer())
      .post('/transaction/parse')
      .send({ text: 'mercado 87,50' })
      .expect(200);

    expect(transactionService.create).not.toHaveBeenCalled();
    expect(transactionService.update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['empty', { text: '' }],
    ['whitespace only', { text: '   ' }],
    ['too long', { text: 'a'.repeat(201) }],
    ['unknown field', { text: 'mercado', user_id: 1 }],
  ])('returns 400 for %s text', async (_label, body) => {
    await request(app.getHttpServer())
      .post('/transaction/parse')
      .send(body)
      .expect(400);

    expect(parserService.parse).not.toHaveBeenCalled();
  });

  it('returns 429 once the route limit (20/min) is exceeded', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 20; i++) {
      await request(server)
        .post('/transaction/parse')
        .send({ text: 'mercado 10' })
        .expect(200);
    }

    await request(server)
      .post('/transaction/parse')
      .send({ text: 'mercado 10' })
      .expect(429);
  });
});
