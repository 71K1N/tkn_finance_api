import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum ShareType {
  EQUAL = 'equal',
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export class GroupMember {
  user_id: number;
  share_type: ShareType;
  share_value: number | null;
  active: boolean;
  joined_at: Date;
}

@Entity()
export class ExpenseGroup {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @Column()
  owner_id: number;

  @Column()
  members: GroupMember[];

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
