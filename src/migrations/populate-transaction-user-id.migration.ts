import { MongoClient } from 'mongodb';

export interface PopulateTransactionUserIdResult {
  modifiedCount: number;
  unresolvedIds: string[];
}

/**
 * Populates `user_id` on legacy transactions from `created_by`, which every
 * transaction has carried since audit fields were introduced. A transaction
 * with neither field cannot be assigned an owner safely — it is reported
 * back instead of guessed at, so a human can decide what to do with it
 * before user-id-scoped access rolls out.
 */
export async function populateTransactionUserId(
  client: MongoClient,
): Promise<PopulateTransactionUserIdResult> {
  const collection = client.db().collection('transaction');

  const updateResult = await collection.updateMany(
    {
      $and: [
        { $or: [{ user_id: { $exists: false } }, { user_id: null }] },
        { created_by: { $exists: true, $ne: null } },
      ],
    },
    [{ $set: { user_id: '$created_by' } }] as any,
  );

  const unresolved = await collection
    .find(
      {
        $and: [
          { $or: [{ user_id: { $exists: false } }, { user_id: null }] },
          { $or: [{ created_by: { $exists: false } }, { created_by: null }] },
        ],
      },
      { projection: { _id: 1 } },
    )
    .toArray();

  return {
    modifiedCount: updateResult.modifiedCount,
    unresolvedIds: unresolved.map((doc) => doc._id.toString()),
  };
}
