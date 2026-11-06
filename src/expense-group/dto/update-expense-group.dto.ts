import { IsOptional, IsString } from 'class-validator';

export class UpdateExpenseGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
