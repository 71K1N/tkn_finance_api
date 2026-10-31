import { Test, TestingModule } from '@nestjs/testing';
import { ObjectId } from 'mongodb';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TransactionParserService } from './transaction-parser.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';

describe('TransactionController', () => {
  let controller: TransactionController;
  let service: {
    create: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    payment: jest.Mock;
    findAll: jest.Mock;
  };

  const USER_ID = 7;
  const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      payment: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionService, useValue: service },
        { provide: TransactionParserService, useValue: { parse: jest.fn() } },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
  });

  it('create() passes the authenticated user id as the owner, not anything from the body', () => {
    const dto = { amount: 10 } as CreateTransactionDto;

    controller.create(USER_ID, dto);

    expect(service.create).toHaveBeenCalledWith(dto, USER_ID);
  });

  it('findOne() passes the authenticated user id for ownership scoping', () => {
    controller.findOne(USER_ID, id);

    expect(service.findOne).toHaveBeenCalledWith(id, USER_ID);
  });

  it('update() passes the authenticated user id as the acting user', () => {
    const dto = { amount: 20 };

    controller.update(USER_ID, id, dto as any);

    expect(service.update).toHaveBeenCalledWith(id, dto, USER_ID);
  });

  it('remove() passes the authenticated user id for ownership scoping', () => {
    controller.remove(USER_ID, id);

    expect(service.remove).toHaveBeenCalledWith(id, USER_ID);
  });

  it('payment() passes the authenticated user id as the acting user', () => {
    const dto: PaymentTransactionDto = { paid_amount: 50 } as any;

    controller.payment(USER_ID, id, dto);

    expect(service.payment).toHaveBeenCalledWith(id, dto, USER_ID);
  });
});
