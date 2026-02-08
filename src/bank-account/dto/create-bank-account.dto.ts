import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  description: string;

  @IsNumber()
  @IsOptional()
  balance: number;
}
