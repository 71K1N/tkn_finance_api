export interface Balance {
  user_id: number;
  balance: number;
}

export interface Transfer {
  from_user_id: number;
  to_user_id: number;
  amount: number;
}

const EPSILON = 0.01;

/**
 * Greedy debt simplification (Splitwise-style): repeatedly matches the largest
 * debtor with the largest creditor. Minimizes transfers in practice but is not
 * guaranteed to find the global minimum (that variant is NP-hard) — an
 * accepted heuristic, not a bug.
 */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.balance > EPSILON)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);
  const debtors = balances
    .filter((b) => b.balance < -EPSILON)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.balance - b.balance);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount =
      Math.round(Math.min(-debtor.balance, creditor.balance) * 100) / 100;

    if (amount > 0) {
      transfers.push({
        from_user_id: debtor.user_id,
        to_user_id: creditor.user_id,
        amount,
      });
    }

    debtor.balance = Math.round((debtor.balance + amount) * 100) / 100;
    creditor.balance = Math.round((creditor.balance - amount) * 100) / 100;

    if (Math.abs(debtor.balance) <= EPSILON) i++;
    if (Math.abs(creditor.balance) <= EPSILON) j++;
  }

  return transfers;
}
