import { IsString, IsNumber, IsPositive, IsOptional, IsDateString, IsEnum, IsMongoId } from 'class-validator';

export class CreateWishItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsPositive()
  estimatedCost: number;

  @IsDateString()
  targetDate: Date;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsMongoId()
  linkedGoalId?: string;
}