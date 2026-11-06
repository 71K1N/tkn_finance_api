import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { populateTransactionUserId } from './populate-transaction-user-id.migration';

dotenv.config();

async function runMigration() {
  const dataSource = new DataSource({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: ['src/**/*.entity.ts'],
    synchronize: false,
  });
  await dataSource.initialize();

  console.log('Connected to MongoDB.');
  console.log('Starting migration: populate transaction user_id field...');

  // TypeORM ships its own duplicated mongodb typings that structurally conflict
  // with the real `mongodb` package's types — the `as any` here is a typing
  // workaround, not a runtime risk (see GroupExpenseService.create for precedent).
  const client = (dataSource.driver as any).queryRunner
    .databaseConnection as MongoClient;

  const { modifiedCount, unresolvedIds } =
    await populateTransactionUserId(client);

  console.log(`Updated ${modifiedCount} documents with user_id.`);

  if (unresolvedIds.length > 0) {
    console.warn(
      `${unresolvedIds.length} transaction(s) have neither user_id nor created_by ` +
        'and were left unmodified. They will become inaccessible once transaction ' +
        'access is scoped by owner. Review and assign an owner manually before deploying that change:',
    );
    for (const id of unresolvedIds) {
      console.warn(`  - ${id}`);
    }
  }

  console.log('Migration completed.');
  await dataSource.destroy();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
