import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class Subcategory {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  categoryId: ObjectId;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Owner. Null on a category/subcategory means the shared system catalogue (read-only).
  @Column({ nullable: true })
  user_id: number | null;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
