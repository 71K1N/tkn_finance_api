import { Column, Entity, ObjectIdColumn, CreateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum AlertLevel {
  WARNING = 'warning',      // 90% threshold
  EXCEEDED = 'exceeded',     // 100% threshold
  OVERAGE = 'overage',       // >100% threshold
}

@Entity()
export class BudgetAlert {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  budgetId: ObjectId;

  @Column()
  threshold: number; // percentage (90, 100, etc.)

  @Column()
  alertLevel: AlertLevel;

  @CreateDateColumn()
  triggeredAt: Date;

  @Column({ default: false })
  acknowledged: boolean;
}
