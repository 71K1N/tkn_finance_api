import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseGroup } from './entities/expense-group.entity';
import { GroupExpense } from './entities/group-expense.entity';
import { ExpenseSplit } from './entities/expense-split.entity';
import { ExpenseSettlement } from './entities/expense-settlement.entity';
import { ExpenseGroupController } from './expense-group.controller';
import { ExpenseGroupService } from './expense-group.service';
import { GroupExpenseService } from './group-expense.service';
import { ExpenseBalanceService } from './expense-balance.service';
import { ExpenseGroupMemberGuard } from './guards/expense-group-member.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpenseGroup,
      GroupExpense,
      ExpenseSplit,
      ExpenseSettlement,
    ]),
  ],
  controllers: [ExpenseGroupController],
  providers: [
    ExpenseGroupService,
    GroupExpenseService,
    ExpenseBalanceService,
    ExpenseGroupMemberGuard,
  ],
  exports: [ExpenseGroupService, GroupExpenseService, ExpenseBalanceService],
})
export class ExpenseGroupModule {}
