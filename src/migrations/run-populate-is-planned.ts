import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

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
  console.log('Starting migration: populate is_planned field...');

  // TypeORM ships its own duplicated mongodb typings that structurally conflict
  // with the real `mongodb` package's types — the `as any` here is a typing
  // workaround, not a runtime risk (see GroupExpenseService.create for precedent).
  const client = (dataSource.driver as any).queryRunner
    .databaseConnection as MongoClient;
  const collection = client.db().collection('transaction');

  // Update documents without is_planned field using MongoDB updateMany with $cond
  const updateResult = await collection.updateMany(
    { is_planned: { $exists: false } },
    [
      {
        $set: {
          is_planned: {
            $cond: [
              {
                $and: [
                  { $ne: ['$due_date', null] },
                  { $ne: ['$due_date', ''] },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
    ] as any,
  );

  console.log(
    `Updated ${updateResult.modifiedCount} documents with is_planned field.`,
  );

  // Create composite index for performance
  console.log(
    'Creating composite index on (user_id, is_planned, payment_date)...',
  );

  try {
    await collection.createIndex({
      user_id: 1,
      is_planned: 1,
      payment_date: 1,
    });
    console.log('Composite index created successfully.');
  } catch (error) {
    console.error(
      'Warning: Index creation failed. Queries will still work but may be slower.',
      error,
    );
  }

  console.log('Migration completed.');
  await dataSource.destroy();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
