import { IsString, IsInt, IsOptional, IsMongoId } from 'class-validator';

export class CreateSubcategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsMongoId()
  categoryId: string;

  @IsOptional()
  @IsString()
  created_by?: number;

  @IsOptional()
  @IsString()
  updated_by?: number;
}
