import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { populateOwnerUserId } from './populate-owner-user-id.migration';

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
  console.log('Starting migration: populate user_id on accounts/categories...');

  // Same typing workaround as run-populate-transaction-user-id.ts.
  const client = (dataSource.driver as any).queryRunner
    .databaseConnection as MongoClient;

  const result = await populateOwnerUserId(client);
  console.log(
    `Updated user_id on ${result.bankAccounts} bank account(s), ` +
      `${result.categories} category(ies), ${result.subcategories} subcategory(ies).`,
  );

  console.log('Migration completed.');
  await dataSource.destroy();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
