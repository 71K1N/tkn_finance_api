import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
} from 'class-validator';
import { ShareType } from '../entities/expense-group.entity';

export class AddGroupMemberDto {
  @IsInt()
  user_id: number;

  @IsEnum(ShareType)
  share_type: ShareType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  share_value?: number;
}
