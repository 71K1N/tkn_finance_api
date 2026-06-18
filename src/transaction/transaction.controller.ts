import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { ObjectId } from 'mongodb';

@UseGuards(AuthGuard)
@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  create(@User() user: any, @Body() createTransactionDto: CreateTransactionDto) {
    // user is injected by AuthGuard. Assign user_id from authenticated user for data isolation.
    if (user && user.id) {
      createTransactionDto.user_id = user.id;
    }
    return this.transactionService.create(createTransactionDto);
  }

  @Get()
  async findAll(): Promise<TransactionResponseDto[]> {
    return this.transactionService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', MongoIdPipe) id: ObjectId): Promise<TransactionResponseDto | null> {
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
