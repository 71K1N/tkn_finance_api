import { BadRequestException } from '@nestjs/common';
import { computeSplits } from './split-calculator.util';
import { GroupMember, ShareType } from './entities/expense-group.entity';
import { SplitType } from './entities/group-expense.entity';

function member(
  user_id: number,
  overrides: Partial<GroupMember> = {},
): GroupMember {
  return {
    user_id,
    share_type: ShareType.EQUAL,
    share_value: null,
    active: true,
    joined_at: new Date(),
    ...overrides,
  };
}

describe('computeSplits', () => {
  it('splits equally and sums exactly to the total', () => {
    const members = [member(1), member(2), member(3)];
    const splits = computeSplits(members, 10, SplitType.EQUAL);
    const total = splits.reduce((acc, s) => acc + s.amount_owed, 0);
    expect(total).toBeCloseTo(10, 2);
    expect(splits.map((s) => s.amount_owed).sort()).toEqual([3.33, 3.33, 3.34]);
  });

  it('ignores inactive members when splitting equally', () => {
    const members = [member(1), member(2, { active: false }), member(3)];
    const splits = computeSplits(members, 10, SplitType.EQUAL);
    expect(splits).toHaveLength(2);
    expect(splits.map((s) => s.user_id)).toEqual([1, 3]);
  });

  it('splits by percentage using group member share_value', () => {
    const members = [
      member(1, { share_type: ShareType.PERCENTAGE, share_value: 60 }),
      member(2, { share_type: ShareType.PERCENTAGE, share_value: 40 }),
    ];
    const splits = computeSplits(members, 200, SplitType.PERCENTAGE);
    expect(splits.find((s) => s.user_id === 1)?.amount_owed).toBe(120);
    expect(splits.find((s) => s.user_id === 2)?.amount_owed).toBe(80);
  });

  it('throws when percentages do not sum to 100', () => {
    const members = [
      member(1, { share_type: ShareType.PERCENTAGE, share_value: 60 }),
      member(2, { share_type: ShareType.PERCENTAGE, share_value: 30 }),
    ];
    expect(() => computeSplits(members, 200, SplitType.PERCENTAGE)).toThrow(
      BadRequestException,
    );
  });

  it('applies per-expense overrides instead of the group default', () => {
    const members = [
      member(1, { share_type: ShareType.PERCENTAGE, share_value: 60 }),
      member(2, { share_type: ShareType.PERCENTAGE, share_value: 40 }),
    ];
    const splits = computeSplits(members, 100, SplitType.PERCENTAGE, [
      { user_id: 1, share_value: 50 },
      { user_id: 2, share_value: 50 },
    ]);
    expect(splits.find((s) => s.user_id === 1)?.amount_owed).toBe(50);
    expect(splits.find((s) => s.user_id === 2)?.amount_owed).toBe(50);
  });

  it('splits fixed amounts and validates they sum to the total', () => {
    const members = [member(1), member(2)];
    const splits = computeSplits(members, 100, SplitType.FIXED, [
      { user_id: 1, share_value: 70 },
      { user_id: 2, share_value: 30 },
    ]);
    expect(splits.find((s) => s.user_id === 1)?.amount_owed).toBe(70);
    expect(splits.find((s) => s.user_id === 2)?.amount_owed).toBe(30);
  });

  it('throws when fixed amounts do not sum to the total', () => {
    const members = [member(1), member(2)];
    expect(() =>
      computeSplits(members, 100, SplitType.FIXED, [
        { user_id: 1, share_value: 70 },
        { user_id: 2, share_value: 40 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('distributes proportionally by shares/weights', () => {
    const members = [member(1), member(2)];
    const splits = computeSplits(members, 90, SplitType.SHARES, [
      { user_id: 1, share_value: 2 },
      { user_id: 2, share_value: 1 },
    ]);
    expect(splits.find((s) => s.user_id === 1)?.amount_owed).toBe(60);
    expect(splits.find((s) => s.user_id === 2)?.amount_owed).toBe(30);
  });

  it('throws when a member is missing a share value for non-equal splits', () => {
    const members = [
      member(1, { share_type: ShareType.PERCENTAGE, share_value: 100 }),
      member(2),
    ];
    expect(() => computeSplits(members, 100, SplitType.PERCENTAGE)).toThrow(
      BadRequestException,
    );
  });

  it('throws when there are no active members', () => {
    const members = [member(1, { active: false })];
    expect(() => computeSplits(members, 100, SplitType.EQUAL)).toThrow(
      BadRequestException,
    );
  });
});
