import { IsString, IsNumber, IsPositive, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class UpdateWishItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimatedCost?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: Date;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';
}