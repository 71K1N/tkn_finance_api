import {
  GroupExpenseStatus,
  SplitType,
} from '../entities/group-expense.entity';

export class ExpenseSplitResponseDto {
  id: string;
  user_id: number;
  share_value: number;
  amount_owed: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
  }
}

export class GroupExpenseResponseDto {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  paid_by: number;
  expense_date: Date;
  split_type: SplitType;
  status: GroupExpenseStatus;
  transaction_id: string | null;
  splits?: ExpenseSplitResponseDto[];
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.group_id?.toString) {
      this.group_id = partial.group_id.toString();
    }
    if (partial?.transaction_id?.toString) {
      this.transaction_id = partial.transaction_id.toString();
    }
    if (Array.isArray(partial?.splits)) {
      this.splits = partial.splits.map(
        (s: any) => new ExpenseSplitResponseDto(s),
      );
    }
  }
}
