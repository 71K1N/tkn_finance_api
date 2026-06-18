import { Column, Entity, ObjectIdColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class BankAccount {
  @ObjectIdColumn()
  id: ObjectId;

  // eslint-disable-next-line prettier/prettier
  @Column()
  description: string;

  @Column()
  balance: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
