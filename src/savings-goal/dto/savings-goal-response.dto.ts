export class SavingsGoalProgressDto {
  targetAmount: number;
  currentSaved: number;
  remaining: number;
  percentageComplete: number;
  monthlyAllocation: number;
  projectedCompletionDate: Date | null;
}

export class SavingsGoalResponseDto {
  id: string;
  userId: number;
  targetAmount: number;
  currentSaved: number;
  monthlyAllocation: number;
  projectedCompletionDate: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: number;
  updated_by?: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
  }
}