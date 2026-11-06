import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Subcategory } from '../subcategory/entities/subcategory.entity';

/**
 * One-off data fix: some subcategory documents were inserted (likely by an old
 * seed run, before SubcategoryService.create()'s toObjectId() conversion existed)
 * with `categoryId` stored as a plain hex string instead of a BSON ObjectId.
 * Every categoryId equality query in the codebase (BudgetService.calculateSpent,
 * TransactionService.resolveCategoryTotals, etc.) compares against a real ObjectId,
 * so those rows silently never match — this is why budgets never counted spending
 * against categories reached through one of these subcategories.
 */
async function fixSubcategoryCategoryIdTypes() {
  const dataSource = new DataSource({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: [Subcategory],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();

  const subcategoryRepo = dataSource.getMongoRepository(Subcategory);
  const all = await subcategoryRepo.find();
  const stringTyped = all.filter((s) => typeof s.categoryId === 'string');

  console.log(
    `Encontradas ${stringTyped.length} de ${all.length} subcategoria(s) com categoryId como string.`,
  );

  for (const sub of stringTyped) {
    const fixedCategoryId = ObjectId.createFromHexString(
      sub.categoryId as unknown as string,
    );
    await subcategoryRepo.updateOne(
      { _id: sub.id },
      { $set: { categoryId: fixedCategoryId } },
    );
    console.log(
      `  ${sub.id.toString()} (${sub.name}): categoryId '${sub.categoryId}' -> ObjectId`,
    );
  }

  console.log(`Concluído. ${stringTyped.length} documento(s) corrigido(s).`);
  await dataSource.destroy();
}

fixSubcategoryCategoryIdTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha ao corrigir categoryId das subcategorias:', err);
    process.exit(1);
  });
