import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { MongoRepository, Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BudgetService } from '../budget/budget.service';
import { BankAccount } from 'src/bank-account/entities/bank-account.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: MongoRepository<Transaction>,
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Subcategory)
    private subcategoryRepository: Repository<Subcategory>,
    private readonly budgetService: BudgetService,
  ) {}

  async create(createTransactionDto: CreateTransactionDto) {
    const account = await this.bankAccountRepository.findOne({
      where: { _id: toObjectId(createTransactionDto.account_id) } as any,
    });
    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    const amount = Number(createTransactionDto.amount || 0);
    if (!(amount > 0)) {
      throw new HttpException(
        'Amount must be a positive number',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createTransactionDto.subcategory_id) {
      const subcat = await this.subcategoryRepository.findOne({
        where: { _id: toObjectId(createTransactionDto.subcategory_id) } as any,
      });
      if (!subcat) {
        throw new HttpException('Subcategory not found', HttpStatus.NOT_FOUND);
      }
    }

    const t = (createTransactionDto.type || '').toLowerCase();
    const userId = (createTransactionDto as any).user_id || null;

    if (t === 'transfer') {
      const targetId = createTransactionDto.target_account_id;
      if (!targetId) {
        throw new HttpException(
          'Target account required for transfer',
          HttpStatus.BAD_REQUEST,
        );
      }

      const targetAccount = await this.bankAccountRepository.findOne({
        where: { _id: toObjectId(targetId) } as any,
      });
      if (!targetAccount) {
        throw new HttpException(
          'Target account not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // if (Number(account.balance) < amount) {
      //   throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
      // }

      const sourceTx = await this.transactionRepository.save({
        ...createTransactionDto,
        account_id: toObjectId(createTransactionDto.account_id),
        target_account_id: toObjectId(targetId),
        created_by: userId,
        updated_by: userId,
      } as any);

      await this.transactionRepository.save({
        ...createTransactionDto,
        account_id: toObjectId(targetId),
        target_account_id: toObjectId(createTransactionDto.account_id),
        type: 'transfer',
        created_by: userId,
        updated_by: userId,
      } as any);

      account.balance = Number(account.balance) - amount;
      targetAccount.balance = Number(targetAccount.balance) + amount;
      await this.bankAccountRepository.save(account);
      await this.bankAccountRepository.save(targetAccount);

      return sourceTx as TransactionResponseDto;
    }

    const payload = {
      ...(createTransactionDto as any),
      account_id: toObjectId(createTransactionDto.account_id),
      subcategory_id: createTransactionDto.subcategory_id
        ? toObjectId(createTransactionDto.subcategory_id)
        : undefined,
      target_account_id: createTransactionDto.target_account_id
        ? toObjectId(createTransactionDto.target_account_id)
        : undefined,
      created_by: userId,
      updated_by: userId,
    } as any;

    const saved = await this.transactionRepository.save(payload as any);

    // if (t === 'income') {
    //   account.balance = Number(account.balance) + amount;
    // } else if (t === 'expense') {
    //   account.balance = Number(account.balance) - amount;
    //   if (account.balance < 0) {
    //     throw new HttpException('Insufficient funds', HttpStatus.CONFLICT);
    //   }
    // }

    // await this.bankAccountRepository.save(account);

    return saved as TransactionResponseDto;
  }

  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.transactionRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: [
        'name',
        'description',
        'type',
        'account_id',
        'subcategory_id',
      ],
      sortableFields: [
        'name',
        'amount',
        'due_date',
        'payment_date',
        'type',
        'created_at',
        'updated_at',
      ],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { user_id: userId },
    });
  }

  findOne(id: ObjectId) {
    return this.transactionRepository.findOne({ where: { _id: id } as any });
  }

  async getSummary(userId: number) {
    const results = (await this.transactionRepository
      .aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ])
      .toArray()) as unknown as { _id: string; total: number }[];

    const totalExpenses = results.find((r) => r._id === 'EXPENSE')?.total ?? 0;
    const totalIncome = results.find((r) => r._id === 'INCOME')?.total ?? 0;

    return {
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
    };
  }

  async update(
    id: ObjectId,
    updateTransactionDto: UpdateTransactionDto,
    userId?: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    Object.assign(transaction, updateTransactionDto);
    if (userId) transaction.updated_by = userId;
    return this.transactionRepository.save(transaction);
  }

  remove(id: ObjectId) {
    return this.transactionRepository
      .findOne({ where: { _id: id } as any })
      .then((result) => this.transactionRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }

  async payment(
    id: ObjectId,
    paymentDto: PaymentTransactionDto,
    userId?: number,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { _id: id } as any,
    });
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Balance only moves when a transaction is actually paid/received, not at creation
    // (creation just registers a pending due amount). Guard against double-applying the
    // balance change if this transaction was already paid before.
    if (!transaction.payment_date) {
      const accountId = ObjectId.createFromHexString(
        transaction.account_id.toString(),
      );
      const account = await this.bankAccountRepository.findOne({
        where: { _id: accountId } as any,
      });
      if (account) {
        const amount = Number(paymentDto.paid_amount);
        const type = (transaction.type || '').toLowerCase();
        if (type === 'income') {
          account.balance = Number(account.balance) + amount;
        } else if (type === 'expense') {
          account.balance = Number(account.balance) - amount;
        }
        await this.bankAccountRepository.save(account);
      }
    }

    transaction.payment_date = paymentDto.payment_date || new Date();
    transaction.paid_amount = paymentDto.paid_amount;
    if (userId) transaction.updated_by = userId;

    return this.transactionRepository.save(transaction);
  }
}
