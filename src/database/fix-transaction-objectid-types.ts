import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Transaction } from '../transaction/entities/transaction.entity';

/**
 * One-off data fix: TransactionService.update() used to Object.assign() the DTO
 * straight onto the entity, so editing a transaction's subcategory_id/account_id/
 * target_account_id via PATCH stored the raw string instead of converting it to an
 * ObjectId (create() already converted correctly — see toObjectId() calls there).
 * Every equality/$in query matched against these fields (e.g.
 * BudgetService.calculateSpent, TransactionService.resolveCategoryTotals) silently
 * never matches a string-typed value, so this is why some paid expenses never
 * counted against their budget. update() is now fixed to convert on write; this
 * script repairs rows written before that fix.
 */
async function fixTransactionObjectIdTypes() {
  const dataSource = new DataSource({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: [Transaction],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();

  const transactionRepo = dataSource.getMongoRepository(Transaction);
  const all = await transactionRepo.find();

  const fields = ['subcategory_id', 'account_id', 'target_account_id'] as const;
  let fixedCount = 0;

  for (const tx of all) {
    const set: Record<string, ObjectId> = {};
    for (const field of fields) {
      const value = tx[field] as unknown;
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        set[field] = ObjectId.createFromHexString(value);
      }
    }
    if (Object.keys(set).length > 0) {
      await transactionRepo.updateOne({ _id: tx.id }, { $set: set });
      console.log(`  ${tx.id.toString()} (${tx.name}):`, set);
      fixedCount++;
    }
  }

  console.log(
    `Concluído. ${fixedCount} de ${all.length} transação(ões) corrigida(s).`,
  );
  await dataSource.destroy();
}

fixTransactionObjectIdTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha ao corrigir ObjectIds das transações:', err);
    process.exit(1);
  });
