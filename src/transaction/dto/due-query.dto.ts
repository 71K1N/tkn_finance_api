import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_DUE_DAYS = 7;
export const MAX_DUE_DAYS = 90;

export class DueQueryDto {
  /** How many days ahead (from today) count as "upcoming". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DUE_DAYS)
  days: number = DEFAULT_DUE_DAYS;
}
