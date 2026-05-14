export type MatchType = 'exact' | 'partial' | 'excess';

export interface DebtMatch {
  debtorUserId: string;
  splitIds: string[];
  debtAmount: number;
  matchedAmount: number;
  matchType: MatchType;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function fuzzyNameMatch(senderName: string, memberName: string): boolean {
  const sender = normalize(senderName);
  const parts  = normalize(memberName).split(/\s+/).filter(w => w.length > 2);
  return parts.some(p => sender.includes(p));
}

/**
 * Returns ALL debtors whose total debt matches the incoming amount (exact/partial/excess).
 * Sorted by match quality: exact → excess → partial.
 *
 * If senderName is provided, non-matching members are filtered out first.
 * Callers should show a selector when matches.length > 1.
 */
export function matchDebt(
  incomingAmount: number,
  senderName: string | null,
  members: { userId: string; fullName: string }[],
  splits: { id: string; amount: number; debtorUserId: string }[],
  tolerancePct = 0.05,
): DebtMatch[] {
  const byDebtor: Record<string, typeof splits> = {};
  for (const s of splits) {
    if (!byDebtor[s.debtorUserId]) byDebtor[s.debtorUserId] = [];
    byDebtor[s.debtorUserId].push(s);
  }

  const results: DebtMatch[] = [];

  for (const [debtorId, debtorSplits] of Object.entries(byDebtor)) {
    if (senderName) {
      const member = members.find(m => m.userId === debtorId);
      if (member && !fuzzyNameMatch(senderName, member.fullName)) continue;
    }

    const totalDebt = debtorSplits.reduce((acc, sp) => acc + sp.amount, 0);
    const tolerance = totalDebt * tolerancePct;
    const diff      = incomingAmount - totalDebt;

    let matchType: MatchType;
    if (Math.abs(diff) <= tolerance) {
      matchType = 'exact';
    } else if (diff < 0) {
      matchType = 'partial';
    } else {
      matchType = 'excess';
    }

    results.push({
      debtorUserId: debtorId,
      splitIds:     debtorSplits.map(s => s.id),
      debtAmount:   totalDebt,
      matchedAmount: incomingAmount,
      matchType,
    });
  }

  const order: Record<MatchType, number> = { exact: 0, excess: 1, partial: 2 };
  return results.sort((a, b) => order[a.matchType] - order[b.matchType]);
}
