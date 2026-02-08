import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WebhookEventType {
  BUDGET_THRESHOLD_WARNING = 'budget.threshold_warning',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  BUDGET_THRESHOLD_OVERAGE = 'budget.threshold_overage',
  WISH_ITEM_STATUS_CHANGED = 'wish_item.status_changed',
}

@Entity()
export class WebhookSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  userId: number;

  @Column({
    type: 'varchar',
    length: 100,
    enum: WebhookEventType,
  })
  eventType: WebhookEventType;

  @Column({ type: 'varchar', length: 500 })
  endpoint: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column('int')
  created_by: number;

  @Column('int', { nullable: true })
  updated_by: number;
}
