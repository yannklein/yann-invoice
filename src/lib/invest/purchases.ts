import { round2, type Trade } from './types';

export type PurchaseMonth = { month: string; total: number } & Record<string, number | string>;

const addMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

/**
 * What was spent on buys each month, per fund (commission included), from the first buy to `today`'s month with empty
 * months kept so the timing shows. Transfers between accounts are not buys.
 */
export function purchasesByMonth(trades: Trade[], today: string): { months: PurchaseMonth[]; symbols: string[]; totalEur: number } {
  const buys = trades.filter((t) => t.source !== 'transfer' && t.quantity > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!buys.length) return { months: [], symbols: [], totalEur: 0 };
  const bySymbol = new Map<string, number>();
  const byMonth = new Map<string, Map<string, number>>();
  for (const t of buys) {
    const m = t.date.slice(0, 7);
    const row = byMonth.get(m) ?? new Map<string, number>();
    row.set(t.symbol, (row.get(t.symbol) ?? 0) + t.amountEur);
    byMonth.set(m, row);
    bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + t.amountEur);
  }
  const months: PurchaseMonth[] = [];
  const last = today.slice(0, 7);
  for (let m = buys[0].date.slice(0, 7); m <= last; m = addMonth(m)) {
    const row = byMonth.get(m);
    const entry: PurchaseMonth = { month: m, total: 0 };
    for (const [s, v] of row ?? []) {
      entry[s] = round2(v);
      entry.total = round2(entry.total + v);
    }
    months.push(entry);
  }
  const symbols = [...bySymbol].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return { months, symbols, totalEur: round2([...bySymbol.values()].reduce((a, b) => a + b, 0)) };
}
