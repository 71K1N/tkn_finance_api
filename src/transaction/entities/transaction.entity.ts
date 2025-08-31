import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  description: string;

  @Column('float')
  amount: number;

  @Column('date')
  due_date: Date;

  @Column('date',{nullable:true})
  payment_date: Date;

  @Column('int')
  subcategory_id: number;

  @Column('int')
  user_id: number;

  @Column('int')
  account_id: number;

  @Column('float')
  paid_amount: number;

  @Column({length: 255})
  type: string;

  @ManyToOne(() => Subcategory)
  @JoinColumn({ name: 'subcategory_id' })
  subcategory: Subcategory;
}
