export enum AccountType {
  CHECKING = 'CHECKING',
  INVESTMENT = 'INVESTMENT',
}

/**
 * Accounts stored before `type` existed have no value; they are checking
 * accounts. Every reader goes through this so the API behaves the same before
 * and after `migrate:populate-account-type` runs.
 */
export function accountTypeOf(
  account: { type?: string | null } | null | undefined,
): AccountType {
  return account?.type === AccountType.INVESTMENT
    ? AccountType.INVESTMENT
    : AccountType.CHECKING;
}
