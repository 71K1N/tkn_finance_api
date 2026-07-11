import { IsNumber, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class CreateSavingsGoalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsPositive()
  targetAmount: number;

  @IsNumber()
  @IsPositive()
  monthlyAllocation: number;
}
