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
  getBalance(@Param('id') id: string) {
    return this.bankAccountService.getBalance(+id);
  }

  @Get(':id/transactions')
  getTransactions(@Param('id') id: string) {
    return this.bankAccountService.getTransactions(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bankAccountService.findOne(+id);
  }

  @Patch(':id')
  update(
    @User() user: any,
    @Param('id') id: string,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
  ) {
    if (user && user.id) {
      (updateBankAccountDto as any).updated_by = user.id;
    }
    return this.bankAccountService.update(+id, updateBankAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankAccountService.remove(+id);
  }
}
