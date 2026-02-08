import { RolloverPolicy } from '../entities/budget.entity';
import { AlertLevel } from '../entities/budget-alert.entity';

export class BudgetAlertResponseDto {
  id: number;
  budgetId: number;
  threshold: number;
  alertLevel: AlertLevel;
  triggeredAt: Date;
  acknowledged: boolean;
}

export class BudgetResponseDto {
  id: number;
  userId: number;
  categoryId: number;
  month: string;
  amount: number;
  spent: number;
  rolloverPolicy: RolloverPolicy;
  alerts?: BudgetAlertResponseDto[];
  created_at: Date;
  updated_at: Date;
  created_by: number;
  updated_by?: number;

  constructor(partial: Partial<BudgetResponseDto>) {
    Object.assign(this, partial);
  }
}
