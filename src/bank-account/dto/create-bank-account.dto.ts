import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { AccountType } from '../account-type';

export class CreateBankAccountDto {
  @IsString()
  description: string;

  @IsNumber()
  @IsOptional()
  balance: number;

  // Defaults to CHECKING on create (see BankAccountService.create).
  @IsEnum(AccountType)
  @IsOptional()
  type?: AccountType;
}
