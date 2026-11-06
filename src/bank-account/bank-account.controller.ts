import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { BankAccountService } from './bank-account.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { User } from '../common/user.decorator';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@Controller('bank-account')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post()
  create(
    @User() userId: number,
    @Body() createBankAccountDto: CreateBankAccountDto,
  ) {
    return this.bankAccountService.create(userId, createBankAccountDto);
  }

  @Get()
  findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    return this.bankAccountService.findAll(userId, query);
  }

  @Get('total-balance')
  async getTotalBalance(@User() userId: number) {
    return {
      totalBalance: await this.bankAccountService.getTotalBalance(userId),
    };
  }

  @Get(':id/balance')
  getBalance(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.getBalance(id, userId);
  }

  @Get(':id/transactions')
  getTransactions(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
  ) {
    return this.bankAccountService.getTransactions(id, userId);
  }

  @Get(':id')
  findOne(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
  ) {
    return this.bankAccountService.update(id, userId, updateBankAccountDto);
  }

  @Delete(':id')
  remove(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.remove(id, userId);
  }
}
