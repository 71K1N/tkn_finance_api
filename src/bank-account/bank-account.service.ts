import { Injectable } from '@nestjs/common';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Repository } from 'typeorm/repository/Repository';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private bankAccountRepository: Repository<BankAccount>,
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
}
