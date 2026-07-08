import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SplitType } from '../entities/group-expense.entity';

export class SplitOverrideDto {
  @IsInt()
  user_id: number;

  @IsNumber()
  @IsPositive()
  share_value: number;
}

export class CreateGroupExpenseDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  expense_date?: string;

  @IsOptional()
  @IsEnum(SplitType)
  split_type?: SplitType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitOverrideDto)
  overrides?: SplitOverrideDto[];
}
