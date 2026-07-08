import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, MongoRepository } from 'typeorm';
import { MongoClient, ObjectId } from 'mongodb';
import { ExpenseGroup } from './entities/expense-group.entity';
import {
  GroupExpense,
  GroupExpenseStatus,
  SplitType,
} from './entities/group-expense.entity';
import { ExpenseSplit } from './entities/expense-split.entity';
import { CreateGroupExpenseDto } from './dto/create-group-expense.dto';
import { computeSplits } from './split-calculator.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class GroupExpenseService {
  constructor(
    @InjectRepository(GroupExpense)
    private expenseRepository: MongoRepository<GroupExpense>,
    @InjectRepository(ExpenseSplit)
    private splitRepository: MongoRepository<ExpenseSplit>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /**
   * Creates the expense and its per-member splits as a single atomic write.
   *
   * TypeORM's MongoDB query runner does NOT implement real transactions
   * (startTransaction/commitTransaction/rollbackTransaction are no-ops in
   * typeorm's mongodb driver) — so we go around it and drive the native
   * mongodb driver's session/transaction API directly. insertOne/insertMany
   * on the ORM's mongoManager forward options (including `session`) straight
   * to the native collection call, which is what makes this atomic.
   */
  async create(
    group: ExpenseGroup,
    actingUserId: number,
    dto: CreateGroupExpenseDto,
  ): Promise<GroupExpense> {
    const splitType = dto.split_type ?? SplitType.EQUAL;
    const computed = computeSplits(
      group.members,
      dto.amount,
      splitType,
      dto.overrides,
    );

    const expenseId = new ObjectId();
    const now = new Date();

    const expenseDoc = {
      _id: expenseId,
      group_id: group.id,
      description: dto.description,
      amount: dto.amount,
      paid_by: actingUserId,
      expense_date: dto.expense_date ? new Date(dto.expense_date) : now,
      split_type: splitType,
      status: GroupExpenseStatus.ACTIVE,
      transaction_id: null,
      created_at: now,
      updated_at: now,
      created_by: actingUserId,
      updated_by: actingUserId,
    };
    const splitDocs = computed.map((s) => ({
      _id: new ObjectId(),
      group_id: group.id,
      expense_id: expenseId,
      user_id: s.user_id,
      share_value: s.share_value,
      amount_owed: s.amount_owed,
      created_at: now,
    }));

    // TypeORM ships its own duplicated mongodb typings that structurally
    // conflict with the real `mongodb` package's ClientSession type — the
    // `as any` on options below is a typing workaround, not a runtime risk.
    const client = (this.dataSource.driver as any).queryRunner
      .databaseConnection as MongoClient;
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await this.dataSource.mongoManager.insertOne(
          GroupExpense,
          expenseDoc as any,
          { session } as any,
        );
        await this.dataSource.mongoManager.insertMany(
          ExpenseSplit,
          splitDocs as any,
          { session } as any,
        );
      });
    } finally {
      await session.endSession();
    }

    return this.expenseRepository.findOne({ where: { _id: expenseId } as any });
  }

  findAll(groupId: ObjectId, query: FindAllQueryDto) {
    return paginate(this.expenseRepository, query, {
      searchableFields: ['description'],
      sortableFields: ['expense_date', 'amount', 'created_at'],
      defaultSort: { key: 'expense_date', direction: 'desc' },
      baseWhere: {
        group_id: ObjectId.createFromHexString(groupId.toString()),
        status: GroupExpenseStatus.ACTIVE,
      },
    });
  }

  async findOneWithSplits(
    groupId: ObjectId,
    expenseId: ObjectId,
  ): Promise<{ expense: GroupExpense; splits: ExpenseSplit[] }> {
    const expense = await this.expenseRepository.findOne({
      where: { _id: expenseId, group_id: groupId } as any,
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    const splits = await this.splitRepository.find({
      where: {
        expense_id: ObjectId.createFromHexString(expenseId.toString()),
      } as any,
    });
    return { expense, splits };
  }

  async voidExpense(
    groupId: ObjectId,
    expenseId: ObjectId,
    group: ExpenseGroup,
    actingUserId: number,
  ): Promise<GroupExpense> {
    const expense = await this.expenseRepository.findOne({
      where: { _id: expenseId, group_id: groupId } as any,
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    if (
      expense.created_by !== actingUserId &&
      group.owner_id !== actingUserId
    ) {
      throw new ForbiddenException(
        'Only the expense creator or the group owner can void this expense',
      );
    }

    expense.status = GroupExpenseStatus.VOID;
    expense.updated_by = actingUserId;
    expense.updated_at = new Date();
    return this.expenseRepository.save(expense);
  }
}
