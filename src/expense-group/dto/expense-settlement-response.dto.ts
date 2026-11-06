export class ExpenseSettlementResponseDto {
  id: string;
  group_id: string;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  note: string | null;
  settled_at: Date;
  created_by: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.group_id?.toString) {
      this.group_id = partial.group_id.toString();
    }
  }
}
