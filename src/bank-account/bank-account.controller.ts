import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { BankAccountService } from './bank-account.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@UseGuards(AuthGuard)
@Controller('bank-account')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post()
  create(@User() user: any, @Body() createBankAccountDto: CreateBankAccountDto) {
    if (user && user.id) {
      (createBankAccountDto as any).created_by = user.id;
      (createBankAccountDto as any).updated_by = user.id;
    }
    return this.bankAccountService.create(createBankAccountDto);
  }

  @Get()
  findAll() {
    return this.bankAccountService.findAll();
  }

  @Get(':id/balance')
  getBalance(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.getBalance(id);
  }

  @Get(':id/transactions')
  getTransactions(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.getTransactions(id);
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.findOne(id);
  }

  @Patch(':id')
  update(
    @User() user: any,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
  ) {
    if (user && user.id) {
      (updateBankAccountDto as any).updated_by = user.id;
    }
    return this.bankAccountService.update(id, updateBankAccountDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.bankAccountService.remove(id);
  }
}
