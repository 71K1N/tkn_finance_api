import { RolloverPolicy } from '../entities/budget.entity';
import { AlertLevel } from '../entities/budget-alert.entity';

export class BudgetAlertResponseDto {
  id: string;
  budgetId: string;
  threshold: number;
  alertLevel: AlertLevel;
  triggeredAt: Date;
  acknowledged: boolean;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.budgetId?.toString) {
      this.budgetId = partial.budgetId.toString();
    }
  }
}

export class BudgetResponseDto {
  id: string;
  userId: number;
  categoryId: string;
  month: string;
  amount: number;
  spent: number;
  rolloverPolicy: RolloverPolicy;
  alerts?: BudgetAlertResponseDto[];
  created_at: Date;
  updated_at: Date;
  created_by: number;
  updated_by?: number;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.categoryId?.toString) {
      this.categoryId = partial.categoryId.toString();
    }
  }
}
