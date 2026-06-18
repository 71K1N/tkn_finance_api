import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum WebhookEventType {
  BUDGET_THRESHOLD_WARNING = 'budget.threshold_warning',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  BUDGET_THRESHOLD_OVERAGE = 'budget.threshold_overage',
  WISH_ITEM_STATUS_CHANGED = 'wish_item.status_changed',
}

@Entity()
export class WebhookSubscription {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  userId: number;

  @Column()
  eventType: WebhookEventType;

  @Column()
  endpoint: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column()
  created_by: number;

  @Column({ nullable: true })
  updated_by: number;
}
