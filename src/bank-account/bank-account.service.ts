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

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private bankAccountRepository: MongoRepository<BankAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}
  create(createBankAccountDto: CreateBankAccountDto) {
    return this.bankAccountRepository.save(createBankAccountDto);
  }

  findAll(query: FindAllQueryDto) {
    return paginate(this.bankAccountRepository, query, {
      searchableFields: ['description'],
      filterableFields: ['description'],
      sortableFields: ['description', 'balance', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
    });
  }

  findOne(id: ObjectId) {
    return this.bankAccountRepository.findOne({ where: { _id: id } as any });
  }

  async update(id: ObjectId, updateBankAccountDto: UpdateBankAccountDto) {
    const account = await this.bankAccountRepository.findOne({
      where: { _id: id } as any,
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    Object.assign(account, updateBankAccountDto);
    return this.bankAccountRepository.save(account);
  }

  remove(id: ObjectId) {
    return this.bankAccountRepository
      .findOne({ where: { _id: id } as any })
      .then((result) => this.bankAccountRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }

  async getBalance(id: ObjectId) {
    const account = await this.bankAccountRepository.findOne({
      where: { _id: id } as any,
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return { account_id: account.id, balance: account.balance };
  }

  async getTransactions(accountId: ObjectId) {
    return this.transactionRepository.find({
      where: { account_id: accountId },
    });
  }
}
