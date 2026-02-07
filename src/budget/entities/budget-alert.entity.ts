import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Budget } from './budget.entity';

export enum AlertLevel {
  WARNING = 'warning',      // 90% threshold
  EXCEEDED = 'exceeded',     // 100% threshold
  OVERAGE = 'overage',       // >100% threshold
}

@Entity()
export class BudgetAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  budgetId: number;

  @ManyToOne(() => Budget)
  @JoinColumn({ name: 'budgetId' })
  budget: Budget;

  @Column('float')
  threshold: number; // percentage (90, 100, etc.)

  @Column({ type: 'varchar', length: 20, enum: AlertLevel })
  alertLevel: AlertLevel;

  @CreateDateColumn({ type: 'datetime' })
  triggeredAt: Date;

  @Column('boolean', { default: false })
  acknowledged: boolean;
}
