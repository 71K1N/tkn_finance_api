import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SortQueryDto {
  @IsString()
  key: string;

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc';
}

export class FindAllQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SortQueryDto)
  sort?: SortQueryDto;

  @IsOptional()
  @IsObject()
  filters?: Record<string, string>;
}
