export class WishItemResponseDto {
  id: string;
  userId: number;
  name: string;
  estimatedCost: number;
  targetDate: Date;
  status: 'active' | 'completed' | 'abandoned' | 'on_hold';
  priority: 'low' | 'medium' | 'high';
  linkedGoalId?: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: number;
  updated_by?: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.linkedGoalId?.toString) {
      this.linkedGoalId = partial.linkedGoalId.toString();
    }
  }
}
