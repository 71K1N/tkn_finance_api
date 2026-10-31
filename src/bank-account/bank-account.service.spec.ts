import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { Transaction } from '../transaction/entities/transaction.entity';
import { BankAccountService } from './bank-account.service';
import { BankAccount } from './entities/bank-account.entity';

describe('BankAccountService (owner scoping)', () => {
  let service: BankAccountService;
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountService,
        { provide: getRepositoryToken(BankAccount), useValue: repo },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(BankAccountService);
  });

  it('stamps the owner on create', async () => {
    const saved = await service.create(7, { description: 'x', balance: 1 });
    expect(saved).toMatchObject({ user_id: 7, created_by: 7, updated_by: 7 });
  });

  it('sums only the requesting user accounts', async () => {
    repo.find.mockResolvedValue([{ balance: 10 }, { balance: 5 }]);
    await expect(service.getTotalBalance(7)).resolves.toBe(15);
    expect(repo.find).toHaveBeenCalledWith({ where: { user_id: 7 } });
  });

  it('looks accounts up by id and owner, so another user gets a 404', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getBalance(id, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update(id, 7, {} as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { _id: id, user_id: 7 },
    });
  });
});
