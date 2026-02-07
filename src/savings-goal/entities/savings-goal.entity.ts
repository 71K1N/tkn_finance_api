import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class SavingsGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  userId: number;

  @Column('float')
  targetAmount: number;

  @Column('float', { default: 0 })
  currentSaved: number;

  @Column('float')
  monthlyAllocation: number;

  @Column('date', { nullable: true })
  projectedCompletionDate: Date | null; // computed: currentDate + ((targetAmount - currentSaved) / monthlyAllocation) months

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column('int', { nullable: true })
  created_by: number | null;

  @Column('int', { nullable: true })
  updated_by: number | null;
}
