import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string | null;

  @Column({ length: 255 })
  description: string | null;

  @Column('float')
  amount: number;

  @Column('date')
  due_date: Date | null;

  @Column('date',{nullable:true})
  payment_date: Date;

  @Column('int', { nullable: true })
  subcategory_id: number | null;

  @Column('int', { nullable: true })
  user_id: number | null;

  @Column('int')
  account_id: number;

  @Column('int', { nullable: true })
  target_account_id: number | null;

  @Column('float', { nullable: true, default: 0 })
  paid_amount: number | null;

  @Column({length: 255})
  type: string;

  @ManyToOne(() => Subcategory)
  @JoinColumn({ name: 'subcategory_id' })
  subcategory: Subcategory;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column('int', { nullable: true })
  created_by: number | null;

  @Column('int', { nullable: true })
  updated_by: number | null;
}
