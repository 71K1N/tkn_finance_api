import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RolloverPolicy {
  NO_ROLLOVER = 'no_rollover',
  CARRY_BALANCE = 'carry_balance',
}

@Entity()
export class Budget {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  userId: number;

  @Column('int')
  categoryId: number;

  @Column({ type: 'varchar', length: 7 }) // YYYY-MM format
  month: string;

  @Column('float')
  amount: number;

  @Column('float', { default: 0 })
  spent: number; // computed from transactions

  @Column({ type: 'varchar', length: 20, enum: RolloverPolicy, default: RolloverPolicy.NO_ROLLOVER })
  rolloverPolicy: RolloverPolicy;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column('int', { nullable: true })
  created_by: number | null;

  @Column('int', { nullable: true })
  updated_by: number | null;
}
