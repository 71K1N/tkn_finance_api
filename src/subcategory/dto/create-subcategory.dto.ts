import { IsString, IsOptional, IsMongoId } from 'class-validator';

export class CreateSubcategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsMongoId()
  categoryId: string;
}
