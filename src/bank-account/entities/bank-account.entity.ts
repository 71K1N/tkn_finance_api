import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';
import { AccountType } from '../account-type';

@Entity()
export class BankAccount {
  @ObjectIdColumn()
  id: ObjectId;

  // eslint-disable-next-line prettier/prettier
  @Column()
  description: string;

  @Column()
  balance: number;

  // Absent on accounts created before the field existed; read it through accountTypeOf().
  @Column({ nullable: true })
  type?: AccountType;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Owner of the account; every query is scoped by it.
  @Column({ nullable: true })
  user_id: number | null;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
