import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsMongoId,
  IsDateString,
  IsDate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ToZonedDate } from '../../common/date/zoned-date.transform';

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

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  due_date?: Date;

  @IsOptional()
  @ToZonedDate()
  @IsDate()
  payment_date?: Date;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  subcategory_id?: string;

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
