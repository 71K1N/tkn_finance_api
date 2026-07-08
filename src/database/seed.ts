import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Category } from '../category/entities/category.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { CATEGORY_TAXONOMY } from './seed-data';

async function seed() {
  const dataSource = new DataSource({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: [Category, Subcategory],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();

  const categoryRepo = dataSource.getMongoRepository(Category);
  const subcategoryRepo = dataSource.getMongoRepository(Subcategory);

  let categoriesCreated = 0;
  let categoriesSkipped = 0;
  let subcategoriesCreated = 0;
  let subcategoriesSkipped = 0;

  try {
    for (const categorySeed of CATEGORY_TAXONOMY) {
      const name = categorySeed.name.trim();
      let category = await categoryRepo.findOne({ where: { name } as any });

      if (!category) {
        category = await categoryRepo.save(
          categoryRepo.create({
            name,
            description: categorySeed.description,
            created_by: null,
            updated_by: null,
          }),
        );
        categoriesCreated++;
        console.log(`Categoria criada: ${name}`);
      } else {
        categoriesSkipped++;
        console.log(`Categoria já existe, ignorando: ${name}`);
      }

      for (const subSeed of categorySeed.subcategories) {
        const subName = subSeed.name.trim();
        const existingSub = await subcategoryRepo.findOne({
          where: { name: subName, categoryId: category.id } as any,
        });

        if (!existingSub) {
          await subcategoryRepo.save(
            subcategoryRepo.create({
              name: subName,
              description: subSeed.description,
              categoryId: category.id,
              created_by: null,
              updated_by: null,
            }),
          );
          subcategoriesCreated++;
          console.log(`  Subcategoria criada: ${subName}`);
        } else {
          subcategoriesSkipped++;
          console.log(`  Subcategoria já existe, ignorando: ${subName}`);
        }
      }
    }

    console.log('\nResumo:');
    console.log(
      `Categorias: ${categoriesCreated} criadas, ${categoriesSkipped} ignoradas`,
    );
    console.log(
      `Subcategorias: ${subcategoriesCreated} criadas, ${subcategoriesSkipped} ignoradas`,
    );
  } catch (err) {
    console.error('Erro ao executar o seed:', err);
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

seed();
