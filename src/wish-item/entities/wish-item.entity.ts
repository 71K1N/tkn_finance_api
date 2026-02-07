import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column('float')
  estimatedCost: number;

  @Column('date')
  targetDate: Date;

  @Column({ type: 'varchar', length: 20, enum: WishItemStatus, default: WishItemStatus.ACTIVE })
  status: WishItemStatus;

  @Column({ type: 'varchar', length: 10, enum: WishItemPriority, default: WishItemPriority.MEDIUM })
  priority: WishItemPriority;

  @Column('int', { nullable: true })
  linkedGoalId: number | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column('int', { nullable: true })
  created_by: number | null;

  @Column('int', { nullable: true })
  updated_by: number | null;
}
