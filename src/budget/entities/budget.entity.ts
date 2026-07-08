import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum RolloverPolicy {
  NO_ROLLOVER = 'no_rollover',
  CARRY_BALANCE = 'carry_balance',
}

@Entity()
export class Budget {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  userId: number;

  @Column()
  categoryId: ObjectId;

  @Column()
  month: string;

  @Column()
  amount: number;

  @Column({ default: 0 })
  spent: number; // computed from transactions

  @Column()
  rolloverPolicy: RolloverPolicy;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
