import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('refresh_tokens')
export class RefreshToken {
  @ObjectIdColumn()
  _id: ObjectId;

  @Index()
  @Column()
  userId: number;

  @Index()
  @Column()
  familyId: string;

  /** SHA-256 of the opaque token; the raw value is never stored. */
  @Index({ unique: true })
  @Column()
  tokenHash: string;

  @Column()
  expiresAt: Date;

  /** Fixed at login; documents are removed by Mongo once it passes. */
  @Index({ expireAfterSeconds: 0 })
  @Column()
  familyExpiresAt: Date;

  @Column({ nullable: true })
  usedAt: Date | null;

  @Column({ nullable: true })
  revokedAt: Date | null;

  @Column({ nullable: true })
  userAgent: string | null;

  @Column()
  createdAt: Date;
}
