import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BudgetService } from '../budget/budget.service';
import { BankAccount } from 'src/bank-account/entities/bank-account.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private readonly budgetService: BudgetService,
  ) {}
  async create(createTransactionDto: CreateTransactionDto) {
    // Use a transaction to ensure atomic save + balance update
    return this.transactionRepository.manager.transaction(async (manager) => {
      const accountRepo = manager.getRepository(BankAccount);
      const trxRepo = manager.getRepository(Transaction);

      const account = await accountRepo.findOne({ where: { id: toObjectId(createTransactionDto.account_id) } });
      if (!account) {
        throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
      }

      // Basic amount validation (defensive in service as well)
      const amount = Number(createTransactionDto.amount || 0);
      if (!(amount > 0)) {
        throw new HttpException('Amount must be a positive number', HttpStatus.BAD_REQUEST);
      }

      // If subcategory provided, ensure it exists and is linked to a category
      if (createTransactionDto.subcategory_id) {
        const subcatRepo = manager.getRepository(Subcategory);
        const subcat = await subcatRepo.findOne({ where: { id: toObjectId(createTransactionDto.subcategory_id) } });
        if (!subcat) {
          throw new HttpException('Subcategory not found', HttpStatus.NOT_FOUND);
        }
      }

      // Handle transfer specially: debit source account and credit target account
      const t = (createTransactionDto.type || '').toLowerCase();
      const userId = (createTransactionDto as any).user_id || null;

      if (t === 'transfer') {
        const targetId = createTransactionDto.target_account_id;
        if (!targetId) {
          throw new HttpException('Target account required for transfer', HttpStatus.BAD_REQUEST);
        }

        const targetAccount = await accountRepo.findOne({ where: { id: toObjectId(targetId) } });
        if (!targetAccount) {
          throw new HttpException('Target account not found', HttpStatus.NOT_FOUND);
        }

        const amt = Number(createTransactionDto.amount || 0);
        if (Number(account.balance) < amt) {
          throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
        }

        // Create source transaction (transfer-out)
        const sourceTx = await trxRepo.save({
          ...createTransactionDto,
          account_id: toObjectId(createTransactionDto.account_id),
          target_account_id: toObjectId(targetId),
          created_by: userId,
          updated_by: userId,
        } as any);

        // Create target transaction (transfer-in)
        const targetTx = await trxRepo.save({
          ...createTransactionDto,
          account_id: toObjectId(targetId),
          target_account_id: toObjectId(createTransactionDto.account_id),
          type: 'transfer',
          created_by: userId,
          updated_by: userId,
        } as any);

        // Update balances
        account.balance = Number(account.balance) - amt;
        targetAccount.balance = Number(targetAccount.balance) + amt;

        await accountRepo.save(account);
        await accountRepo.save(targetAccount);

        // Return the source transaction by default
        return sourceTx as TransactionResponseDto;
      }

      // Persist the transaction first (non-transfer)
      const payload = {
        ...(createTransactionDto as any),
        account_id: toObjectId(createTransactionDto.account_id),
        subcategory_id: createTransactionDto.subcategory_id ? toObjectId(createTransactionDto.subcategory_id) : undefined,
        target_account_id: createTransactionDto.target_account_id ? toObjectId(createTransactionDto.target_account_id) : undefined,
        created_by: userId,
        updated_by: userId,
      } as any;

      const saved = await trxRepo.save(payload as any);

      // Update balance depending on transaction type
      if (t === 'income') {
        account.balance = Number(account.balance) + Number(createTransactionDto.amount || 0);
      } else if (t === 'expense') {
        account.balance = Number(account.balance) - Number(createTransactionDto.amount || 0);
        if (account.balance < 0) {
          // business rule: allow negative? for now, prevent negative balances
          throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
        }
      }

      await accountRepo.save(account);

      return saved as TransactionResponseDto;
    });
  }

  async findAll(): Promise<TransactionResponseDto[]> {
    const transactions = await this.transactionRepository.find();
    return transactions.map((transaction) => ({
      ...transaction,
      id: transaction.id?.toString ? transaction.id.toString() : String(transaction.id),
      subcategory_id: transaction.subcategory_id?.toString ? transaction.subcategory_id.toString() : null,
      account_id: transaction.account_id?.toString ? transaction.account_id.toString() : String(transaction.account_id),
      target_account_id: transaction.target_account_id?.toString ? transaction.target_account_id.toString() : null,
      category_id: null,
    } as TransactionResponseDto));
  }

  async findOne(id: ObjectId): Promise<TransactionResponseDto | null> {
    const transaction = await this.transactionRepository.findOne({ where: { id } });
    if (!transaction) {
      return null;
    }

    return {
      ...transaction,
      id: transaction.id?.toString ? transaction.id.toString() : String(transaction.id),
      subcategory_id: transaction.subcategory_id?.toString ? transaction.subcategory_id.toString() : null,
      account_id: transaction.account_id?.toString ? transaction.account_id.toString() : String(transaction.account_id),
      target_account_id: transaction.target_account_id?.toString ? transaction.target_account_id.toString() : null,
      category_id: null,
    } as TransactionResponseDto;
  }

  update(id: ObjectId, updateTransactionDto: UpdateTransactionDto, userId?: number) {
    const payload = { ...(updateTransactionDto as any) };
    if (userId) payload.updated_by = userId;
    return this.transactionRepository.update(id, payload);
  }

  remove(id: ObjectId) {
    return this.transactionRepository.delete(id);
  }

  async payment(id: ObjectId, paymentDto: PaymentTransactionDto, userId?: number) {
    const transaction = await this.findOne(id);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const payload: any = {
      payment_date: paymentDto.payment_date || new Date(),
      paid_amount: paymentDto.paid_amount,
    };
    if (userId) payload.updated_by = userId;

    return this.transactionRepository.update(id, payload);
  }
}
