import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { normalizeDueDate } from './normalize-due-date.migration';

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
  console.log('Starting migration: normalize due_date storage...');

  // TypeORM ships its own duplicated mongodb typings that structurally conflict
  // with the real `mongodb` package's types — the `as any` here is a typing
  // workaround, not a runtime risk (see GroupExpenseService.create for precedent).
  const client = (dataSource.driver as any).queryRunner
    .databaseConnection as MongoClient;

  const { modifiedCount } = await normalizeDueDate(client);

  console.log(`Converted due_date on ${modifiedCount} document(s).`);
  console.log('Migration completed.');
  await dataSource.destroy();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
