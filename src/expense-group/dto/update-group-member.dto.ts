import { IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ShareType } from '../entities/expense-group.entity';

export class UpdateGroupMemberDto {
  @IsEnum(ShareType)
  share_type: ShareType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  share_value?: number;
}
