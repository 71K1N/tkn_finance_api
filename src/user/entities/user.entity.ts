import { Column, CreateDateColumn, Entity, Index, ObjectIdColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  /** Numeric id referenced by every other collection (`created_by`, `userId`, ...). */
  @Index({ unique: true })
  @Column()
  id: number;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ nullable: true })
  name: string | null;

  @Column({ nullable: true })
  picture: string | null;

  /** Google subject; empty until the first sign-in links it. */
  @Index({ unique: true, sparse: true })
  @Column({ nullable: true })
  google_sub?: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  last_login_at: Date | null;
}
