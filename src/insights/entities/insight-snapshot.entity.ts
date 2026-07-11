import {
  Column,
  Entity,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightSource = 'llm' | 'template';

export interface InsightHighlight {
  message: string;
  severity: InsightSeverity;
  categoryName?: string;
  amount?: number;
  percentageIncrease?: number;
}

@Entity()
export class InsightSnapshot {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  userId: number;

  @Column()
  date: string; // YYYY-MM-DD, cache key — one snapshot per user per day

  @Column()
  facts: Record<string, unknown>; // the exact deterministic numbers sent to the LLM, kept for audit

  @Column()
  summary: string;

  @Column()
  highlights: InsightHighlight[];

  @Column()
  source: InsightSource;

  @Column({ nullable: true })
  modelUsed: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  created_by: number | null;

  @Column({ nullable: true })
  updated_by: number | null;
}
