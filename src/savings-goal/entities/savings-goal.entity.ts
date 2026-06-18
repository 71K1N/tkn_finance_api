import { Column, Entity, ObjectIdColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class SavingsGoal {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  userId: number;

  @Column()
  targetAmount: number;

  @Column({ default: 0 })
  currentSaved: number;

  @Column()
  monthlyAllocation: number;

  @Column({ nullable: true })
  projectedCompletionDate: Date | null; // computed: currentDate + ((targetAmount - currentSaved) / monthlyAllocation) months

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
