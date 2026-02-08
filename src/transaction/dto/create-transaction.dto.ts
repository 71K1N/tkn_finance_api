import { IsString, IsOptional, IsNumber, IsPositive, IsInt, IsDateString } from 'class-validator';

export class CreateTransactionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  due_date?: Date;

  @IsOptional()
  @IsDateString()
  payment_date?: Date;

  @IsOptional()
  @IsInt()
  subcategory_id?: number;

  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsInt()
  account_id: number;

  @IsOptional()
  @IsInt()
  target_account_id?: number;

  @IsOptional()
  @IsNumber()
  paid_amount?: number;

  @IsString()
  type: string;
}
