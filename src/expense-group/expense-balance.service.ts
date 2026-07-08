import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import {
  GroupExpense,
  GroupExpenseStatus,
} from './entities/group-expense.entity';
import { ExpenseSplit } from './entities/expense-split.entity';
import { ExpenseSettlement } from './entities/expense-settlement.entity';
import { RecordSettlementDto } from './dto/record-settlement.dto';
import {
  GroupBalanceDto,
  SettlementSuggestionDto,
} from './dto/balance-response.dto';
import { simplifyDebts } from './debt-simplifier.util';
import { roundCents } from './split-calculator.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class ExpenseBalanceService {
  constructor(
    @InjectRepository(GroupExpense)
    private expenseRepository: MongoRepository<GroupExpense>,
    @InjectRepository(ExpenseSplit)
    private splitRepository: MongoRepository<ExpenseSplit>,
    @InjectRepository(ExpenseSettlement)
    private settlementRepository: MongoRepository<ExpenseSettlement>,
  ) {}

  async getGroupBalances(groupId: ObjectId): Promise<GroupBalanceDto[]> {
    const scopedGroupId = ObjectId.createFromHexString(groupId.toString());
    const balances = new Map<number, number>();
    const add = (userId: number, delta: number) =>
      balances.set(userId, roundCents((balances.get(userId) ?? 0) + delta));

    const expenses = await this.expenseRepository.find({
      where: {
        group_id: scopedGroupId,
        status: GroupExpenseStatus.ACTIVE,
      } as any,
    });

    if (expenses.length > 0) {
      const expenseIds = expenses.map((e) =>
        ObjectId.createFromHexString(e.id.toString()),
      );
      const splits = await this.splitRepository.find({
        where: { expense_id: { $in: expenseIds } } as any,
      });

      const splitsByExpense = new Map<string, ExpenseSplit[]>();
      for (const split of splits) {
        const key = split.expense_id.toString();
        const bucket = splitsByExpense.get(key) ?? [];
        bucket.push(split);
        splitsByExpense.set(key, bucket);
      }

      for (const expense of expenses) {
        add(expense.paid_by, expense.amount);
        const expenseSplits = splitsByExpense.get(expense.id.toString()) ?? [];
        for (const split of expenseSplits) {
          add(split.user_id, -split.amount_owed);
        }
      }
    }

    const settlements = await this.settlementRepository.find({
      where: { group_id: scopedGroupId } as any,
    });
    for (const settlement of settlements) {
      add(settlement.from_user_id, settlement.amount);
      add(settlement.to_user_id, -settlement.amount);
    }

    return Array.from(balances.entries()).map(([user_id, balance]) => ({
      user_id,
      balance,
    }));
  }

  async getSettlementSuggestions(
    groupId: ObjectId,
  ): Promise<SettlementSuggestionDto[]> {
    const balances = await this.getGroupBalances(groupId);
    return simplifyDebts(balances);
  }

  async recordSettlement(
    groupId: ObjectId,
    fromUserId: number,
    dto: RecordSettlementDto,
  ): Promise<ExpenseSettlement> {
    if (dto.to_user_id === fromUserId) {
      throw new BadRequestException('Cannot record a settlement to yourself');
    }
    const settlement = this.settlementRepository.create({
      group_id: groupId,
      from_user_id: fromUserId,
      to_user_id: dto.to_user_id,
      amount: dto.amount,
      note: dto.note ?? null,
      settled_at: new Date(),
      created_by: fromUserId,
    });
    return this.settlementRepository.save(settlement);
  }

  findSettlements(groupId: ObjectId, query: FindAllQueryDto) {
    return paginate(this.settlementRepository, query, {
      sortableFields: ['settled_at', 'amount'],
      defaultSort: { key: 'settled_at', direction: 'desc' },
      baseWhere: { group_id: ObjectId.createFromHexString(groupId.toString()) },
    });
  }
}
