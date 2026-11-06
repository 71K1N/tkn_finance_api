import { BadRequestException } from '@nestjs/common';
import { GroupMember } from './entities/expense-group.entity';
import { SplitType } from './entities/group-expense.entity';

export interface SplitOverride {
  user_id: number;
  share_value: number;
}

export interface ComputedSplit {
  user_id: number;
  share_value: number;
  amount_owed: number;
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSplits(
  members: GroupMember[],
  totalAmount: number,
  splitType: SplitType,
  overrides?: SplitOverride[],
): ComputedSplit[] {
  const activeMembers = members
    .filter((m) => m.active)
    .slice()
    .sort((a, b) => a.user_id - b.user_id);

  if (activeMembers.length === 0) {
    throw new BadRequestException(
      'Group has no active members to split an expense between',
    );
  }

  if (splitType === SplitType.EQUAL) {
    const share = roundCents(totalAmount / activeMembers.length);
    const splits = activeMembers.map((m) => ({
      user_id: m.user_id,
      share_value: share,
      amount_owed: share,
    }));
    return fixRoundingDrift(splits, totalAmount);
  }

  const values = activeMembers.map((m) => {
    const override = overrides?.find((o) => o.user_id === m.user_id);
    const raw = override ? override.share_value : m.share_value;
    if (raw === null || raw === undefined) {
      throw new BadRequestException(
        `Missing share value for user ${m.user_id}; set it on the group member or provide an override for this expense`,
      );
    }
    return { user_id: m.user_id, value: raw };
  });

  if (splitType === SplitType.PERCENTAGE) {
    const totalPct = roundCents(values.reduce((acc, v) => acc + v.value, 0));
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException(
        `Percentage splits must sum to 100 (got ${totalPct})`,
      );
    }
    const splits = values.map((v) => ({
      user_id: v.user_id,
      share_value: v.value,
      amount_owed: roundCents((totalAmount * v.value) / 100),
    }));
    return fixRoundingDrift(splits, totalAmount);
  }

  if (splitType === SplitType.FIXED) {
    const totalFixed = roundCents(values.reduce((acc, v) => acc + v.value, 0));
    if (Math.abs(totalFixed - totalAmount) > 0.01) {
      throw new BadRequestException(
        `Fixed splits must sum to the expense amount (got ${totalFixed}, expected ${totalAmount})`,
      );
    }
    return values.map((v) => ({
      user_id: v.user_id,
      share_value: v.value,
      amount_owed: roundCents(v.value),
    }));
  }

  // SHARES: proportional weights, distributed across the total amount
  const totalWeight = values.reduce((acc, v) => acc + v.value, 0);
  if (totalWeight <= 0) {
    throw new BadRequestException('Sum of shares must be greater than zero');
  }
  const splits = values.map((v) => ({
    user_id: v.user_id,
    share_value: v.value,
    amount_owed: roundCents((totalAmount * v.value) / totalWeight),
  }));
  return fixRoundingDrift(splits, totalAmount);
}

/**
 * Floating point division rarely divides an amount exactly; the last member
 * (deterministic user_id order) absorbs the remainder so amounts always sum
 * to the original total exactly, which downstream balance math depends on.
 */
function fixRoundingDrift(
  splits: ComputedSplit[],
  totalAmount: number,
): ComputedSplit[] {
  const computedTotal = roundCents(
    splits.reduce((acc, s) => acc + s.amount_owed, 0),
  );
  const drift = roundCents(totalAmount - computedTotal);
  if (drift !== 0) {
    const last = splits[splits.length - 1];
    last.amount_owed = roundCents(last.amount_owed + drift);
  }
  return splits;
}
