import { Column, Entity, ObjectIdColumn, CreateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class ExpenseSplit {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  group_id: ObjectId;

  @Column()
  expense_id: ObjectId;

  @Column()
  user_id: number;

  @Column()
  share_value: number;

  @Column()
  amount_owed: number;

  @CreateDateColumn()
  created_at: Date;
}
