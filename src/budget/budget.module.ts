import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './entities/budget.entity';
import { BudgetAlert } from './entities/budget-alert.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { BudgetService } from './budget.service';

@Module({
  imports: [TypeOrmModule.forFeature([Budget, BudgetAlert, Transaction])],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
