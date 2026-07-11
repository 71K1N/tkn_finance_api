import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { ObjectId } from 'mongodb';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@UseGuards(AuthGuard)
@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  create(
    @User() user: any,
    @Body() createTransactionDto: CreateTransactionDto,
  ) {
    // user is injected by AuthGuard. Assign user_id from authenticated user for data isolation.
    if (user && user.id) {
      createTransactionDto.user_id = user.id;
    }
    return this.transactionService.create(createTransactionDto);
  }

  @Get()
  findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    return this.transactionService.findAll(userId, query);
  }

  @Get('summary')
  getSummary(@User() userId: number, @Query('month') month?: string) {
    return this.transactionService.getSummary(userId, month);
  }

  @Get('category-breakdown')
  getCategoryBreakdown(@User() userId: number, @Query('month') month?: string) {
    return this.transactionService.getCategoryBreakdown(userId, month);
  }

  @Get('monthly-trend')
  getMonthlyTrend(@User() userId: number, @Query('months') months?: string) {
    return this.transactionService.getMonthlyTrend(
      userId,
      months ? Number(months) : undefined,
    );
  }

  @Get('balance-evolution')
  getBalanceEvolution(
    @User() userId: number,
    @Query('months') months?: string,
  ) {
    return this.transactionService.getBalanceEvolution(
      userId,
      months ? Number(months) : undefined,
    );
  }

  @Get('forecasted-expenses')
  getForecastedExpenses(
    @User() userId: number,
    @Query('month') month?: string,
  ) {
    return this.transactionService.getForecastedExpenses(userId, month);
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  update(
    @User() user: any,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(id, updateTransactionDto, user?.id);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.transactionService.remove(id);
  }

  @Post(':id/payment')
  payment(
    @User() user: any,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() paymentDto: PaymentTransactionDto,
  ) {
    return this.transactionService.payment(id, paymentDto, user?.id);
  }
}
