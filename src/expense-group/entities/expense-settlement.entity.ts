import { Column, Entity, ObjectIdColumn, CreateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class ExpenseSettlement {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  group_id: ObjectId;

  @Column()
  from_user_id: number;

  @Column()
  to_user_id: number;

  @Column()
  amount: number;

  @Column({ nullable: true })
  note: string | null;

  @Column()
  settled_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  created_by: number;
}
