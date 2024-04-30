// import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  description: string;

  // @OneToMany(() => Subcategory, (subcategory) => subcategory.category)
  // subcategories: Subcategory[];
}
