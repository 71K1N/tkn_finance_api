import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum SplitType {
  EQUAL = 'equal',
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  SHARES = 'shares',
}

export enum GroupExpenseStatus {
  ACTIVE = 'active',
  VOID = 'void',
}

@Entity()
export class GroupExpense {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  group_id: ObjectId;

  @Column()
  description: string;

  @Column()
  amount: number;

  @Column()
  paid_by: number;

  @Column()
  expense_date: Date;

  @Column()
  split_type: SplitType;

  @Column({ default: GroupExpenseStatus.ACTIVE })
  status: GroupExpenseStatus;

  @Column({ nullable: true })
  transaction_id: ObjectId | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
