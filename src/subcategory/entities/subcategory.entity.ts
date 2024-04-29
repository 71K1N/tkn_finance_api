// import { Category } from 'src/category/entities/category.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Subcategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  description: string;

  @Column('int')
  categoryId: number;

  // @ManyToOne(() => Category, (category) => category.subcategories)
  // category: Category;
}
