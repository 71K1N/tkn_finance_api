import { MongoClient } from 'mongodb';

/** Id reserved for the owner of pre-existing data (HEIR_EMAIL). */
export const LEGACY_OWNER_USER_ID = 1;

export interface PopulateOwnerUserIdResult {
  bankAccounts: number;
  categories: number;
  subcategories: number;
}

const missingUserId = {
  $or: [{ user_id: { $exists: false } }, { user_id: null }],
};

/**
 * Backfills `user_id` after bank accounts, categories and subcategories became
 * owner-scoped.
 *
 * - Bank accounts: owner is `created_by` when present; otherwise the legacy
 *   owner (id 1). Before the scoping fix `created_by` was never written, so
 *   nearly all legacy accounts fall into the second case.
 * - Categories/subcategories: those with a `created_by` become that user's;
 *   the rest (the seeded taxonomy) keep a null `user_id` and stay the shared,
 *   read-only system catalogue.
 */
export async function populateOwnerUserId(
  client: MongoClient,
): Promise<PopulateOwnerUserIdResult> {
  const db = client.db();

  const fromCreatedBy = [{ $set: { user_id: '$created_by' } }] as any;
  const hasCreatedBy = { created_by: { $exists: true, $ne: null } };

  const accountsByCreator = await db
    .collection('bank_account')
    .updateMany({ $and: [missingUserId, hasCreatedBy] }, fromCreatedBy);
  const accountsFallback = await db
    .collection('bank_account')
    .updateMany(missingUserId, { $set: { user_id: LEGACY_OWNER_USER_ID } });

  const categories = await db
    .collection('category')
    .updateMany({ $and: [missingUserId, hasCreatedBy] }, fromCreatedBy);
  const subcategories = await db
    .collection('subcategory')
    .updateMany({ $and: [missingUserId, hasCreatedBy] }, fromCreatedBy);

  return {
    bankAccounts:
      accountsByCreator.modifiedCount + accountsFallback.modifiedCount,
    categories: categories.modifiedCount,
    subcategories: subcategories.modifiedCount,
  };
}
