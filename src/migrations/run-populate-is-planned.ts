import 'reflect-metadata';
import { createConnection } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const connection = await createConnection({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: ['src/**/*.entity.ts'],
    synchronize: false,
  });

  console.log('Connected to MongoDB.');
  console.log('Starting migration: populate is_planned field...');

  const db = connection.getMongoRepository('Transaction').mongo.db;
  const collection = db.collection('transaction');

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
    ],
  );

  console.log(
    `Updated ${updateResult.modifiedCount} documents with is_planned field.`,
  );

  // Create composite index for performance
  console.log('Creating composite index on (user_id, is_planned, payment_date)...');

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
  await connection.close();
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
