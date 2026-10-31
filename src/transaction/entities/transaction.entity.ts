import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity()
export class Transaction {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  name: string | null;

  @Column()
  description: string | null;

  @Column()
  amount: number;

  /**
   * The calendar day this transaction is due, stored as a plain "YYYY-MM-DD" string
   * carrying no time and no timezone — deliberately not a timestamp. A timestamp would
   * force every reader to pick a zone in which to interpret it, which is exactly how
   * the forecast's off-by-one day arose. Lexicographic order on ISO-8601 dates is
   * chronological order, so Mongo ranges, sorting, and indexes all work on the string.
   *
   * Typed `Date` because TypeORM's column typing predates this decision and the create
   * DTO declares it the same way; the runtime value is always the string. Anything
   * writing this field must write "YYYY-MM-DD" (see `migrate:normalize-due-date`).
   *
   * Contrast `payment_date` below, which genuinely is an instant.
   */
  @Column({ nullable: true })
  due_date: Date | null;

  @Column({ nullable: true })
  payment_date: Date | null;

  @Column({ nullable: true })
  subcategory_id: ObjectId | null;

  @Column({ nullable: true })
  user_id: number | null;

  @Column()
  account_id: ObjectId;

  @Column({ nullable: true })
  target_account_id: ObjectId | null;

  @Column({ nullable: true, default: 0 })
  paid_amount: number | null;

  @Column()
  type: string;

  @Column({ nullable: true })
  is_planned?: boolean;

  // Shared by both legs of a transfer so they can be edited/deleted as one unit.
  // Absent on income/expense transactions and on transfers created before this field existed.
  @Column({ nullable: true })
  transfer_group_id?: ObjectId | null;

  // True on the mirror leg written into the target account's history (see
  // TransactionService.create). The mirror carries no balance effect of its own —
  // the transfer's single balance movement is owned by the other (authoritative) leg.
  @Column({ nullable: true })
  is_transfer_mirror?: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
