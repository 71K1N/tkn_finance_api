import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { MongoRepository, Repository } from 'typeorm';
import { Transaction } from 'src/transaction/entities/transaction.entity';
import { ObjectId } from 'mongodb';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';
import { AccountType, accountTypeOf } from './account-type';

export interface BalanceTotals {
  totalBalance: number;
  available: number;
  invested: number;
}

/** Fills `type` on accounts stored before the field existed. */
function withAccountType(account: BankAccount): BankAccount {
  account.type = accountTypeOf(account);
  return account;
}

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private bankAccountRepository: MongoRepository<BankAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  create(userId: number, createBankAccountDto: CreateBankAccountDto) {
    return this.bankAccountRepository.save({
      ...createBankAccountDto,
      type: createBankAccountDto.type ?? AccountType.CHECKING,
      user_id: userId,
      created_by: userId,
      updated_by: userId,
    });
  }

  async findAll(userId: number, query: FindAllQueryDto) {
    const result = await paginate(this.bankAccountRepository, query, {
      searchableFields: ['description'],
      filterableFields: ['description'],
      sortableFields: ['description', 'balance', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { user_id: userId },
    });
    result.data.forEach(withAccountType);
    return result;
  }

  async findOne(id: ObjectId, userId: number) {
    const account = await this.bankAccountRepository.findOne({
      where: { _id: id, user_id: userId } as any,
    });
    return account ? withAccountType(account) : account;
  }

  async update(
    id: ObjectId,
    userId: number,
    updateBankAccountDto: UpdateBankAccountDto,
  ) {
    const account = await this.findOne(id, userId);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    Object.assign(account, updateBankAccountDto, { updated_by: userId });
    return this.bankAccountRepository.save(account);
  }

  remove(id: ObjectId, userId: number) {
    return this.findOne(id, userId)
      .then((result) => this.bankAccountRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }

  /**
   * The user's balance split by account type: `available` is what sits in
   * checking accounts, `invested` what sits in investment accounts, and
   * `totalBalance` is their sum (the value this endpoint returned before the split).
   */
  async getTotalBalance(userId: number): Promise<BalanceTotals> {
    const accounts = await this.bankAccountRepository.find({
      where: { user_id: userId } as any,
    });
    let available = 0;
    let invested = 0;
    for (const account of accounts) {
      const balance = Number(account.balance) || 0;
      if (accountTypeOf(account) === AccountType.INVESTMENT) {
        invested += balance;
      } else {
        available += balance;
      }
    }
    return { totalBalance: available + invested, available, invested };
  }

  async getBalance(id: ObjectId, userId: number) {
    const account = await this.findOne(id, userId);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return { account_id: account.id, balance: account.balance };
  }

  async getTransactions(accountId: ObjectId, userId: number) {
    const account = await this.findOne(accountId, userId);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return this.transactionRepository.find({
      where: { account_id: accountId },
    });
  }
}
