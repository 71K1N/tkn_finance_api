import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TransactionService } from './transaction.service';
import { Transaction } from './entities/transaction.entity';
import { BankAccount } from '../bank-account/entities/bank-account.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';
import { BudgetService } from '../budget/budget.service';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';

describe('TransactionService', () => {
  let service: TransactionService;
  let transactionRepository: { findOne: jest.Mock; save: jest.Mock };
  let bankAccountRepository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    transactionRepository = { findOne: jest.fn(), save: jest.fn() };
    bankAccountRepository = { findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useValue: bankAccountRepository,
        },
        { provide: getRepositoryToken(Subcategory), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: BudgetService, useValue: {} },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  describe('payment', () => {
    const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');
    const accountId = ObjectId.createFromHexString('507f1f77bcf86cd799439012');
    const paymentDto: PaymentTransactionDto = { paid_amount: 50 } as any;

    it('throws NotFoundException when the transaction does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.payment(id, paymentDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(bankAccountRepository.findOne).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException and leaves balance/record untouched when already paid', async () => {
      const transaction = {
        _id: id,
        type: 'expense',
        account_id: accountId,
        payment_date: new Date('2026-01-01'),
        paid_amount: 30,
      } as unknown as Transaction;
      transactionRepository.findOne.mockResolvedValue(transaction);

      await expect(service.payment(id, paymentDto)).rejects.toThrow(
        ConflictException,
      );
      expect(bankAccountRepository.findOne).not.toHaveBeenCalled();
      expect(bankAccountRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(transaction.payment_date).toEqual(new Date('2026-01-01'));
      expect(transaction.paid_amount).toBe(30);
    });

    it('applies the balance change and records payment on first payment', async () => {
      const transaction = {
        _id: id,
        type: 'income',
        account_id: accountId,
        payment_date: undefined,
      } as unknown as Transaction;
      const account = {
        _id: accountId,
        balance: 100,
      } as unknown as BankAccount;
      transactionRepository.findOne.mockResolvedValue(transaction);
      bankAccountRepository.findOne.mockResolvedValue(account);
      transactionRepository.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.payment(id, paymentDto);

      expect(account.balance).toBe(150);
      expect(bankAccountRepository.save).toHaveBeenCalledWith(account);
      expect(result.payment_date).toBeInstanceOf(Date);
      expect(result.paid_amount).toBe(50);
    });
  });
});
