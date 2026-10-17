import { holdings } from './holdings';
import { round2, type Portfolio, type Trade } from './types';
import type { Quote } from './view';

export interface StockLine {
  symbol: string;
  name: string;
  valueEur: number;
  sharePct: number;
  investedEur: number;
  gainEur: number;
  gainPct: number | null;
  stale: boolean;
}

/** The funds held right now: what they are worth, what was paid for them, and the difference. Cash and the Livret Bleu stay out. */
export interface StockSummary {
  valueEur: number;
  investedEur: number;
  gainEur: number;
  gainPct: number | null;
  /** Paid out as cash, so not part of the gain. */
  dividendsEur: number;
  /** The oldest price date among the held funds. */
  priceDate: string | null;
  stale: boolean;
  lines: StockLine[];
}

const pct = (gain: number, invested: number) => (invested > 0 ? (gain / invested) * 100 : null);

/**
 * What was paid for the shares held, per symbol, at average cost: buys (and transfers in, at their value on the day)
 * add their cost; sales take out the average cost of the shares sold. Closed positions are dropped.
 */
export function costBasis(trades: Trade[]): Record<string, number> {
  const pos: Record<string, { q: number; cost: number }> = {};
  for (const t of [...trades].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = (pos[t.symbol] ??= { q: 0, cost: 0 });
    if (t.quantity > 0) p.cost += t.amountEur;
    else if (p.q > 0) p.cost -= (p.cost / p.q) * Math.min(p.q, -t.quantity);
    p.q += t.quantity;
    if (Math.abs(p.q) < 1e-9) p.cost = 0;
  }
  return Object.fromEntries(Object.entries(pos).filter(([, p]) => Math.abs(p.q) >= 1e-9).map(([s, p]) => [s, round2(p.cost)]));
}

/** A fund without a quote is valued at what was paid for it and marked stale. */
export function stockSummary(p: Pick<Portfolio, 'trades' | 'dividends' | 'symbols'>, quotes: Quote[]): StockSummary {
  const held = holdings(p.trades);
  const cost = costBasis(p.trades);
  const names = new Map(p.symbols.map((s) => [s.symbol, s.name]));
  const rows = Object.entries(held).map(([symbol, units]) => {
    const q = quotes.find((x) => x.symbol === symbol);
    const investedEur = cost[symbol] ?? 0;
    const valueEur = q ? round2(units * q.priceEur) : investedEur;
    return { symbol, name: names.get(symbol) ?? symbol, valueEur, investedEur, date: q?.date ?? null, stale: q?.stale ?? true };
  });
  const valueEur = round2(rows.reduce((s, r) => s + r.valueEur, 0));
  const investedEur = round2(rows.reduce((s, r) => s + r.investedEur, 0));
  const gainEur = round2(valueEur - investedEur);
  const lines = rows
    .map((r) => {
      const gain = round2(r.valueEur - r.investedEur);
      return {
        symbol: r.symbol, name: r.name, valueEur: r.valueEur, sharePct: valueEur > 0 ? (r.valueEur / valueEur) * 100 : 0,
        investedEur: r.investedEur, gainEur: gain, gainPct: pct(gain, r.investedEur), stale: r.stale,
      };
    })
    .sort((a, b) => b.valueEur - a.valueEur);
  const dates = rows.flatMap((r) => (r.date ? [r.date] : [])).sort();
  return {
    valueEur, investedEur, gainEur, gainPct: pct(gainEur, investedEur),
    dividendsEur: round2(p.dividends.reduce((s, d) => s + d.amountEur, 0)),
    priceDate: dates[0] ?? null, stale: lines.some((l) => l.stale), lines,
  };
}
