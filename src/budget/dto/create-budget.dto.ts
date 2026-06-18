import { IsMongoId, IsString, IsNumber, IsPositive, IsOptional, Matches, IsEnum } from 'class-validator';
import { RolloverPolicy } from '../entities/budget.entity';

export class CreateBudgetDto {
  @IsMongoId()
  categoryId: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsEnum(RolloverPolicy)
  rolloverPolicy?: RolloverPolicy;
}
