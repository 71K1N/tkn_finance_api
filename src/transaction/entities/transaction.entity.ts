import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column('date')
  payment_date: Date;

  @Column('int')
  subcategory_id: number;

  @Column('int')
  user_id: number;

  @Column('int')
  account_id: number;

  @Column('float')
  paid_amount: number;
}
