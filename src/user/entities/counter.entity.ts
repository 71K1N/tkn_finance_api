import { Column, Entity, ObjectIdColumn } from 'typeorm';

/** Named sequence, e.g. `{ _id: 'user', seq: 7 }`. */
@Entity('counters')
export class Counter {
  @ObjectIdColumn()
  _id: string;

  @Column()
  seq: number;
}
