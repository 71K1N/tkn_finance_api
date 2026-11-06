import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class UpdateSavingsGoalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetAmount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  monthlyAllocation?: number;
}
