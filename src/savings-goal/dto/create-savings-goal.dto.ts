import { IsNumber, IsPositive } from 'class-validator';

export class CreateSavingsGoalDto {
  @IsNumber()
  @IsPositive()
  targetAmount: number;

  @IsNumber()
  @IsPositive()
  monthlyAllocation: number;
}
