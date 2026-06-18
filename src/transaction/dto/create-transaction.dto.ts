import { IsString, IsOptional, IsNumber, IsPositive, IsMongoId, IsDateString } from 'class-validator';

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
  @IsMongoId()
  subcategory_id?: string;

  @IsOptional()
  @IsNumber()
  user_id?: number;

  @IsMongoId()
  account_id: string;

  @IsOptional()
  @IsMongoId()
  target_account_id?: string;

  @IsOptional()
  @IsNumber()
  paid_amount?: number;

  @IsString()
  type: string;
}
