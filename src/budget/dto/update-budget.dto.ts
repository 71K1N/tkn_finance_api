import { IsNumber, IsOptional, IsPositive, IsEnum } from 'class-validator';
import { RolloverPolicy } from '../entities/budget.entity';

export class UpdateBudgetDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsEnum(RolloverPolicy)
  rolloverPolicy?: RolloverPolicy;
}
