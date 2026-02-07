import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Repository } from 'typeorm';
import { Transaction } from 'src/transaction/entities/transaction.entity';

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

  findOne(id: number) {
    return this.bankAccountRepository.find({ where: { id } });
  }

  update(id: number, updateBankAccountDto: UpdateBankAccountDto) {
    return this.bankAccountRepository.update(id, updateBankAccountDto);
  }

  remove(id: number) {
    return this.bankAccountRepository.delete(id);
  }

  async getBalance(id: number) {
    const account = await this.bankAccountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return { account_id: account.id, balance: account.balance };
  }

  async getTransactions(accountId: number) {
    return this.transactionRepository.find({ where: { account_id: accountId } });
  }
}
