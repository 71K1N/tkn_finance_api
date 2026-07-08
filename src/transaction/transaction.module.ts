import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { Transaction } from './entities/transaction.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetModule } from '../budget/budget.module';
import { BankAccount } from '../bank-account/entities/bank-account.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, BankAccount, Subcategory]),
    BudgetModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
