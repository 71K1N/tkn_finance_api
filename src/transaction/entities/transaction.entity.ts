import { Column, Entity, ObjectIdColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class Transaction {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  name: string | null;

  @Column()
  description: string | null;

  @Column()
  amount: number;

  @Column({ nullable: true })
  due_date: Date | null;

  @Column({ nullable: true })
  payment_date: Date | null;

  @Column({ nullable: true })
  subcategory_id: ObjectId | null;

  @Column({ nullable: true })
  user_id: number | null;

  @Column()
  account_id: ObjectId;

  @Column({ nullable: true })
  target_account_id: ObjectId | null;

  @Column({ nullable: true, default: 0 })
  paid_amount: number | null;

  @Column()
  type: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
