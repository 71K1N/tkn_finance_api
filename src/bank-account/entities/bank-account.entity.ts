import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class BankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  // eslint-disable-next-line prettier/prettier
  @Column({length:244})
  description: string;

  @Column('float')
  balance: number;
}
