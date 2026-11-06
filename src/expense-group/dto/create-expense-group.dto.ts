import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExpenseGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
