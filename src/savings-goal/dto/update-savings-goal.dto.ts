import { IsNumber, IsPositive, IsOptional } from 'class-validator';

export class UpdateSavingsGoalDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetAmount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  monthlyAllocation?: number;
}
