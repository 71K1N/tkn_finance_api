import { MongoClient } from 'mongodb';
import { AccountType } from '../bank-account/account-type';

/**
 * Marks every bank account stored before `type` existed as a checking account.
 * Idempotent: accounts that already have a type are left untouched.
 */
export async function populateAccountType(
  client: MongoClient,
): Promise<{ modifiedCount: number }> {
  const result = await client
    .db()
    .collection('bank_account')
    .updateMany(
      { $or: [{ type: { $exists: false } }, { type: null }] },
      { $set: { type: AccountType.CHECKING } },
    );
  return { modifiedCount: result.modifiedCount };
}
