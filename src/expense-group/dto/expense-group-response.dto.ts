import { GroupMember, ShareType } from '../entities/expense-group.entity';

export class GroupMemberResponseDto {
  user_id: number;
  share_type: ShareType;
  share_value: number | null;
  active: boolean;
  joined_at: Date;

  constructor(partial: GroupMember) {
    Object.assign(this, partial);
  }
}

export class ExpenseGroupResponseDto {
  id: string;
  name: string;
  description: string | null;
  owner_id: number;
  members: GroupMemberResponseDto[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (Array.isArray(partial?.members)) {
      this.members = partial.members.map(
        (m: GroupMember) => new GroupMemberResponseDto(m),
      );
    }
  }
}
