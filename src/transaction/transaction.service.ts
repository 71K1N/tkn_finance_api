import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BankAccount } from 'src/bank-account/entities/bank-account.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}
  async create(createTransactionDto: CreateTransactionDto) {
    // Use a transaction to ensure atomic save + balance update
    return this.transactionRepository.manager.transaction(async (manager) => {
      const accountRepo = manager.getRepository(BankAccount);
      const trxRepo = manager.getRepository(Transaction);

      const account = await accountRepo.findOne({ where: { id: createTransactionDto.account_id } });
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
        const subcat = await subcatRepo.findOne({ where: { id: createTransactionDto.subcategory_id }, relations: ['category'] });
        if (!subcat) {
          throw new HttpException('Subcategory not found', HttpStatus.NOT_FOUND);
        }
        if (!subcat.category) {
          throw new HttpException('Subcategory has no parent category', HttpStatus.BAD_REQUEST);
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

        const targetAccount = await accountRepo.findOne({ where: { id: targetId } });
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
          account_id: createTransactionDto.account_id,
          target_account_id: targetId,
          created_by: userId,
          updated_by: userId,
        } as any);

        // Create target transaction (transfer-in)
        const targetTx = await trxRepo.save({
          ...createTransactionDto,
          account_id: targetId,
          target_account_id: createTransactionDto.account_id,
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
      const saved = await trxRepo.save({
        ...(createTransactionDto as any),
        created_by: userId,
        updated_by: userId,
      } as any);

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
    const transactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.subcategory', 'subcategory')
      .leftJoin('subcategory.category', 'category')
      .addSelect('category.id', 'categoryId')
      .getRawAndEntities();

    return transactions.entities.map((transaction, index) => ({
      ...transaction,
      category_id: transactions.raw[index]?.categoryId || null
    }));
  }

  async findOne(id: number): Promise<TransactionResponseDto | null> {
    const result = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.subcategory', 'subcategory')
      .leftJoin('subcategory.category', 'category')
      .addSelect('category.id', 'categoryId')
      .where('transaction.id = :id', { id })
      .getRawAndEntities();

    if (result.entities.length > 0) {
      const transaction = result.entities[0];
      return {
        ...transaction,
        category_id: result.raw[0]?.categoryId || null
      };
    }

    return null;
  }

  update(id: number, updateTransactionDto: UpdateTransactionDto, userId?: number) {
    const payload = { ...(updateTransactionDto as any) };
    if (userId) payload.updated_by = userId;
    return this.transactionRepository.update(id, payload);
  }

  remove(id: number) {
    return this.transactionRepository.delete(id);
  }

  async payment(id: number, paymentDto: PaymentTransactionDto, userId?: number) {
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
