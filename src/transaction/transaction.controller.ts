import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  ParseEnumPipe,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TransactionService } from './transaction.service';
import { TransactionParserService } from './transaction-parser.service';
import { ParseTransactionTextDto } from './dto/parse-transaction-text.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { User } from '../common/user.decorator';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { ObjectId } from 'mongodb';
import { FindAllTransactionQueryDto } from './dto/find-all-transaction-query.dto';
import { DailySummaryQueryDto } from './dto/daily-summary-query.dto';
import { SummaryStatus } from './summary-status.enum';

@Controller('transaction')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly parserService: TransactionParserService,
  ) {}

  @Post()
  create(
    @User() userId: number,
    @Body() createTransactionDto: CreateTransactionDto,
  ) {
    return this.transactionService.create(createTransactionDto, userId);
  }

  // Tighter than the global 120/min: a miss in the user's history costs a Groq call.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('parse')
  @HttpCode(200)
  parse(@User() userId: number, @Body() dto: ParseTransactionTextDto) {
    return this.parserService.parse(userId, dto.text);
  }

  @Get()
  findAll(@User() userId: number, @Query() query: FindAllTransactionQueryDto) {
    return this.transactionService.findAll(userId, query, {
      from: query.from,
      to: query.to,
      category_id: query.category_id,
    });
  }

  @Get('summary')
  getSummary(
    @User() userId: number,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('account_id') account_id?: string,
    @Query('category_id') category_id?: string,
    @Query('subcategory_id') subcategory_id?: string,
    // Validated with a pipe rather than promoting this route's loose @Query params
    // to a DTO: the global ValidationPipe runs forbidNonWhitelisted, so a DTO here
    // would start rejecting stray query params existing callers already send.
    @Query('status', new ParseEnumPipe(SummaryStatus, { optional: true }))
    status?: SummaryStatus,
  ) {
    return this.transactionService.getSummary(userId, {
      month,
      from,
      to,
      type,
      account_id,
      category_id,
      subcategory_id,
      status,
    });
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

  @Get('daily-summary')
  getDailySummary(
    @User() userId: number,
    @Query() query: DailySummaryQueryDto,
  ) {
    return this.transactionService.getDailySummary(
      userId,
      query.from,
      query.to,
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

  @Get('analysis/planned-vs-unplanned')
  getPlannedVsUnplanned(
    @User() userId: number,
    @Query('month') month?: string,
  ) {
    return this.transactionService.getPlannedVsUnplanned(userId, month);
  }

  @Get(':id')
  findOne(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.transactionService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(id, updateTransactionDto, userId);
  }

  @Delete(':id')
  remove(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.transactionService.remove(id, userId);
  }

  @Post(':id/payment')
  payment(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() paymentDto: PaymentTransactionDto,
  ) {
    return this.transactionService.payment(id, paymentDto, userId);
  }
}
