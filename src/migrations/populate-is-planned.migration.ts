import { DataSource } from 'typeorm';
import { Transaction } from '../transaction/entities/transaction.entity';

export async function populateIsPlannedMigration(
  dataSource: DataSource,
): Promise<void> {
  const transactionRepository = dataSource.getRepository(Transaction);

  console.log('Starting migration: populate is_planned field...');

  // Populate is_planned for documents that don't have it
  const result = await transactionRepository
    .createQueryBuilder()
    .update(Transaction)
    .set({
      is_planned: () =>
        `CASE WHEN due_date IS NOT NULL AND due_date != '' THEN true ELSE false END`,
    })
    .where('is_planned IS NULL')
    .execute();

  console.log(
    `Updated ${result.affected ?? 0} documents with is_planned field.`,
  );

  // Create composite index for performance
  console.log('Creating composite index on (user_id, is_planned, payment_date)...');

  const manager = dataSource.getRepository(Transaction).manager;
  const connection = dataSource.createQueryRunner().connection;

  try {
    // For MongoDB, we use the native driver to create indices
    const db = (connection as any).getDatabase?.();
    if (db) {
      const collection = db.collection('transaction');
      await collection.createIndex({
        user_id: 1,
        is_planned: 1,
        payment_date: 1,
      });
      console.log('Composite index created successfully.');
    } else {
      console.log(
        'Warning: Could not create index via native driver. Index creation may need to be done manually.',
      );
    }
  } catch (error) {
    console.error(
      'Warning: Index creation failed. Queries will still work but may be slower.',
      error,
    );
  }

  console.log('Migration completed.');
}
