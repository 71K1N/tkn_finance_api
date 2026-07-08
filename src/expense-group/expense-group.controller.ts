import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { ExpenseGroupService } from './expense-group.service';
import { GroupExpenseService } from './group-expense.service';
import { ExpenseBalanceService } from './expense-balance.service';
import { ExpenseGroupMemberGuard } from './guards/expense-group-member.guard';
import { CurrentExpenseGroup } from './decorators/expense-group.decorator';
import { ExpenseGroup } from './entities/expense-group.entity';
import { CreateExpenseGroupDto } from './dto/create-expense-group.dto';
import { UpdateExpenseGroupDto } from './dto/update-expense-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { UpdateGroupMemberDto } from './dto/update-group-member.dto';
import { CreateGroupExpenseDto } from './dto/create-group-expense.dto';
import { RecordSettlementDto } from './dto/record-settlement.dto';
import { ExpenseGroupResponseDto } from './dto/expense-group-response.dto';
import { GroupExpenseResponseDto } from './dto/group-expense-response.dto';
import { ExpenseSettlementResponseDto } from './dto/expense-settlement-response.dto';

@Controller('expense-groups')
@UseGuards(AuthGuard)
export class ExpenseGroupController {
  constructor(
    private readonly expenseGroupService: ExpenseGroupService,
    private readonly groupExpenseService: GroupExpenseService,
    private readonly balanceService: ExpenseBalanceService,
  ) {}

  @Post()
  async create(@User() userId: number, @Body() dto: CreateExpenseGroupDto) {
    const group = await this.expenseGroupService.create(userId, dto);
    return new ExpenseGroupResponseDto(group);
  }

  @Get()
  async findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    const result = await this.expenseGroupService.findAllForUser(userId, query);
    return {
      data: result.data.map((g) => new ExpenseGroupResponseDto(g)),
      pagination: result.pagination,
    };
  }

  @Get(':groupId')
  @UseGuards(ExpenseGroupMemberGuard)
  findOne(@CurrentExpenseGroup() group: ExpenseGroup) {
    return new ExpenseGroupResponseDto(group);
  }

  @Patch(':groupId')
  @UseGuards(ExpenseGroupMemberGuard)
  async update(
    @User() userId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Body() dto: UpdateExpenseGroupDto,
  ) {
    const group = await this.expenseGroupService.update(groupId, userId, dto);
    return new ExpenseGroupResponseDto(group);
  }

  @Delete(':groupId')
  @UseGuards(ExpenseGroupMemberGuard)
  async archive(
    @User() userId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
  ) {
    await this.expenseGroupService.archive(groupId, userId);
    return { message: 'Expense group archived successfully' };
  }

  @Post(':groupId/members')
  @UseGuards(ExpenseGroupMemberGuard)
  async addMember(
    @User() userId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Body() dto: AddGroupMemberDto,
  ) {
    const group = await this.expenseGroupService.addMember(
      groupId,
      userId,
      dto,
    );
    return new ExpenseGroupResponseDto(group);
  }

  @Patch(':groupId/members/:userId')
  @UseGuards(ExpenseGroupMemberGuard)
  async updateMember(
    @User() actingUserId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() dto: UpdateGroupMemberDto,
  ) {
    const group = await this.expenseGroupService.updateMember(
      groupId,
      targetUserId,
      actingUserId,
      dto,
    );
    return new ExpenseGroupResponseDto(group);
  }

  @Delete(':groupId/members/:userId')
  @UseGuards(ExpenseGroupMemberGuard)
  async removeMember(
    @User() actingUserId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    const group = await this.expenseGroupService.removeMember(
      groupId,
      targetUserId,
      actingUserId,
    );
    return new ExpenseGroupResponseDto(group);
  }

  @Post(':groupId/expenses')
  @UseGuards(ExpenseGroupMemberGuard)
  async createExpense(
    @User() userId: number,
    @CurrentExpenseGroup() group: ExpenseGroup,
    @Body() dto: CreateGroupExpenseDto,
  ) {
    const expense = await this.groupExpenseService.create(group, userId, dto);
    return new GroupExpenseResponseDto(expense);
  }

  @Get(':groupId/expenses')
  @UseGuards(ExpenseGroupMemberGuard)
  async findExpenses(
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Query() query: FindAllQueryDto,
  ) {
    const result = await this.groupExpenseService.findAll(groupId, query);
    return {
      data: result.data.map((e) => new GroupExpenseResponseDto(e)),
      pagination: result.pagination,
    };
  }

  @Get(':groupId/expenses/:expenseId')
  @UseGuards(ExpenseGroupMemberGuard)
  async findExpense(
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Param('expenseId', MongoIdPipe) expenseId: ObjectId,
  ) {
    const { expense, splits } =
      await this.groupExpenseService.findOneWithSplits(groupId, expenseId);
    return new GroupExpenseResponseDto({ ...expense, splits });
  }

  @Delete(':groupId/expenses/:expenseId')
  @UseGuards(ExpenseGroupMemberGuard)
  async voidExpense(
    @User() userId: number,
    @CurrentExpenseGroup() group: ExpenseGroup,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Param('expenseId', MongoIdPipe) expenseId: ObjectId,
  ) {
    const expense = await this.groupExpenseService.voidExpense(
      groupId,
      expenseId,
      group,
      userId,
    );
    return new GroupExpenseResponseDto(expense);
  }

  @Get(':groupId/balances')
  @UseGuards(ExpenseGroupMemberGuard)
  getBalances(@Param('groupId', MongoIdPipe) groupId: ObjectId) {
    return this.balanceService.getGroupBalances(groupId);
  }

  @Get(':groupId/settlement-suggestions')
  @UseGuards(ExpenseGroupMemberGuard)
  getSettlementSuggestions(@Param('groupId', MongoIdPipe) groupId: ObjectId) {
    return this.balanceService.getSettlementSuggestions(groupId);
  }

  @Post(':groupId/settlements')
  @UseGuards(ExpenseGroupMemberGuard)
  async recordSettlement(
    @User() userId: number,
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Body() dto: RecordSettlementDto,
  ) {
    const settlement = await this.balanceService.recordSettlement(
      groupId,
      userId,
      dto,
    );
    return new ExpenseSettlementResponseDto(settlement);
  }

  @Get(':groupId/settlements')
  @UseGuards(ExpenseGroupMemberGuard)
  async findSettlements(
    @Param('groupId', MongoIdPipe) groupId: ObjectId,
    @Query() query: FindAllQueryDto,
  ) {
    const result = await this.balanceService.findSettlements(groupId, query);
    return {
      data: result.data.map((s) => new ExpenseSettlementResponseDto(s)),
      pagination: result.pagination,
    };
  }
}
