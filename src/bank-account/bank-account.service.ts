import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Repository } from 'typeorm';
import { Transaction } from 'src/transaction/entities/transaction.entity';
import { ObjectId } from 'mongodb';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}
  create(createBankAccountDto: CreateBankAccountDto) {
    return this.bankAccountRepository.save(createBankAccountDto);
  }

  findAll() {
    return this.bankAccountRepository.find();
  }

  findOne(id: ObjectId) {
    return this.bankAccountRepository.find({ where: { _id: id } as any });
  }

  async update(id: ObjectId, updateBankAccountDto: UpdateBankAccountDto) {
    const account = await this.bankAccountRepository.findOne({ where: { _id: id } as any });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    Object.assign(account, updateBankAccountDto);
    return this.bankAccountRepository.save(account);
  }

  remove(id: ObjectId) {
    return this.bankAccountRepository.delete(id);
  }

  async getBalance(id: ObjectId) {
    const account = await this.bankAccountRepository.findOne({ where: { _id: id } as any });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return { account_id: account.id, balance: account.balance };
  }

  async getTransactions(accountId: ObjectId) {
    return this.transactionRepository.find({ where: { account_id: accountId } });
  }
}
