export class WishItemResponseDto {
  id: number;
  userId: number;
  name: string;
  estimatedCost: number;
  targetDate: Date;
  status: 'active' | 'completed' | 'abandoned' | 'on_hold';
  priority: 'low' | 'medium' | 'high';
  linkedGoalId?: number | null;
  created_at: Date;
  updated_at: Date;
  created_by: number;
  updated_by?: number;

  constructor(partial: Partial<WishItemResponseDto>) {
    Object.assign(this, partial);
  }
}