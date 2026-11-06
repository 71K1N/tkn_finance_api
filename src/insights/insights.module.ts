import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsightSnapshot } from './entities/insight-snapshot.entity';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { TransactionModule } from '../transaction/transaction.module';
import { BudgetModule } from '../budget/budget.module';
import { BankAccountModule } from '../bank-account/bank-account.module';
import { SavingsGoalModule } from '../savings-goal/savings-goal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InsightSnapshot]),
    TransactionModule,
    BudgetModule,
    BankAccountModule,
    SavingsGoalModule,
  ],
  providers: [InsightsService],
  controllers: [InsightsController],
})
export class InsightsModule {}
