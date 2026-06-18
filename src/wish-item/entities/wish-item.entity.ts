import { Column, Entity, ObjectIdColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum WishItemStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
  ON_HOLD = 'on_hold',
}

export enum WishItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity()
export class WishItem {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column()
  estimatedCost: number;

  @Column()
  targetDate: Date;

  @Column()
  status: WishItemStatus;

  @Column()
  priority: WishItemPriority;

  @Column({ nullable: true })
  linkedGoalId: ObjectId | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
