import { round2, type CashRow, type Portfolio, type Slot, type Trade } from './types';

/** Net quantity per symbol over trades dated on or before `until` (all when omitted). Closed positions are dropped. */
export function holdings(trades: Trade[], until?: string): Record<string, number> {
  const q: Record<string, number> = {};
  for (const t of trades) if (!until || t.date <= until) q[t.symbol] = (q[t.symbol] ?? 0) + t.quantity;
  for (const [s, n] of Object.entries(q)) {
    if (Math.abs(n) < 1e-9) delete q[s];
    else q[s] = Math.round(n * 1e8) / 1e8;
  }
  return q;
}

/** Uninvested IBKR cash in EUR: IBKR deposits − IBKR trade costs + dividends. Sheet deposits and transfers are not cash. */
export function ibkrCashEur(p: Pick<Portfolio, 'trades' | 'deposits' | 'dividends'>, until?: string): number {
  const on = (d: string) => !until || d <= until;
  const deposits = p.deposits.filter((d) => d.source === 'ibkr' && on(d.date)).reduce((s, d) => s + d.amountEur, 0);
  const spent = p.trades.filter((t) => t.source === 'ibkr' && on(t.date)).reduce((s, t) => s + t.amountEur, 0);
  const dividends = p.dividends.filter((d) => on(d.date)).reduce((s, d) => s + d.amountEur, 0);
  return round2(deposits - spent + dividends);
}

/** Livret Bleu balance on `date`: the latest row on or before it, else 0. */
export function livretOn(cash: CashRow[], date: string): number {
  return cash.filter((c) => c.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.balance ?? 0;
}

export interface SlotValue {
  slot: string;
  kind: 'stocks' | 'bonds';
  weight: number;
  valueEur: number;
}

/** EUR value per slot (its held symbols, plus the Livret Bleu for a `livret` slot). Symbols no slot holds are unassigned. */
export function slotValues(slots: Slot[], values: Record<string, number>, livret: number): { slots: SlotValue[]; unassigned: string[] } {
  const total = slots.reduce((s, x) => s + x.targetPct, 0) || 1;
  const held = new Set(slots.flatMap((s) => s.holdSymbols));
  return {
    slots: slots.map((s) => ({
      slot: s.slot,
      kind: s.kind,
      weight: s.targetPct / total,
      valueEur: round2(s.holdSymbols.reduce((sum, sym) => sum + (values[sym] ?? 0), 0) + (s.livret ? livret : 0)),
    })),
    unassigned: Object.keys(values).filter((s) => !held.has(s)),
  };
}

/**
 * Buy-only rebalance: each slot's gap to its target after the buy; gaps are filled (and the rest spread by weight)
 * when the amount covers them, otherwise scaled down to fit. Never sells.
 */
export function rebalance(slots: SlotValue[], amount: number): { slot: string; buyEur: number }[] {
  if (!(amount > 0)) return slots.map((s) => ({ slot: s.slot, buyEur: 0 }));
  const total = slots.reduce((s, x) => s + x.valueEur, 0) + amount;
  const gaps = slots.map((s) => Math.max(0, total * s.weight - s.valueEur));
  const sum = gaps.reduce((a, b) => a + b, 0);
  const buys = sum <= amount ? gaps.map((g, i) => g + (amount - sum) * slots[i].weight) : gaps.map((g) => (g * amount) / sum);
  return slots.map((s, i) => ({ slot: s.slot, buyEur: round2(buys[i]) }));
}

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** The 1st of the next buy month (today counts when it is that day), with the days left. */
export function nextBuyDate(today: string, buyMonths: number[]): { date: string; days: number } | null {
  if (!buyMonths.length) return null;
  const [y, m] = today.split('-').map(Number);
  for (let k = 0; k <= 12; k++) {
    const month = ((m - 1 + k) % 12) + 1;
    const year = y + Math.floor((m - 1 + k) / 12);
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    if (buyMonths.includes(month) && date >= today) return { date, days: Math.round((utc(date) - utc(today)) / DAY) };
  }
  return null;
}
