import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { populateAccountType } from './populate-account-type.migration';

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
  console.log('Starting migration: populate type on bank accounts...');

  // Same typing workaround as run-populate-transaction-user-id.ts.
  const client = (dataSource.driver as any).queryRunner
    .databaseConnection as MongoClient;

  const result = await populateAccountType(client);
  console.log(`Set type=CHECKING on ${result.modifiedCount} bank account(s).`);

  console.log('Migration completed.');
  await dataSource.destroy();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
