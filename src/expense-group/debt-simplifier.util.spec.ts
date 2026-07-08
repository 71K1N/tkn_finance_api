import { simplifyDebts } from './debt-simplifier.util';

describe('simplifyDebts', () => {
  it('returns no transfers when everything is already settled', () => {
    expect(
      simplifyDebts([
        { user_id: 1, balance: 0 },
        { user_id: 2, balance: 0 },
      ]),
    ).toEqual([]);
  });

  it('settles a simple two-person debt in one transfer', () => {
    const transfers = simplifyDebts([
      { user_id: 1, balance: -50 },
      { user_id: 2, balance: 50 },
    ]);
    expect(transfers).toEqual([{ from_user_id: 1, to_user_id: 2, amount: 50 }]);
  });

  it('nets three people down to the minimum number of transfers', () => {
    // A paid 90 for everyone (owes nobody, is owed 60), B owes 30, C owes 30
    const transfers = simplifyDebts([
      { user_id: 'A' as any, balance: 60 },
      { user_id: 'B' as any, balance: -30 },
      { user_id: 'C' as any, balance: -30 },
    ]);
    expect(transfers).toHaveLength(2);
    const total = transfers.reduce((acc, t) => acc + t.amount, 0);
    expect(total).toBeCloseTo(60, 2);
    expect(transfers.every((t) => t.to_user_id === ('A' as any))).toBe(true);
  });

  it('produces transfers that fully zero out all balances', () => {
    const balances = [
      { user_id: 1, balance: 120 },
      { user_id: 2, balance: -50 },
      { user_id: 3, balance: -70 },
    ];
    const transfers = simplifyDebts(balances);
    const net = new Map<number, number>();
    for (const b of balances) net.set(b.user_id, b.balance);
    for (const t of transfers) {
      net.set(t.from_user_id, (net.get(t.from_user_id) ?? 0) + t.amount);
      net.set(t.to_user_id, (net.get(t.to_user_id) ?? 0) - t.amount);
    }
    for (const balance of net.values()) {
      expect(Math.abs(balance)).toBeLessThanOrEqual(0.01);
    }
  });

  it('ignores balances within epsilon of zero', () => {
    expect(
      simplifyDebts([
        { user_id: 1, balance: 0.005 },
        { user_id: 2, balance: -0.005 },
      ]),
    ).toEqual([]);
  });
});
