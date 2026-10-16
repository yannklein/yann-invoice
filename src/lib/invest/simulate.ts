import { holdings, ibkrCashEur, livretOn } from './holdings';
import { priceOn, type PriceSeries } from './prices';
import { round2, type Portfolio } from './types';

export interface Flow {
  date: string;
  amountEur: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Yahoo symbol → series already converted to EUR. */
export type EurSeries = Record<string, PriceSeries>;

/** New money only: `kind: 'new'` deposits plus Livret Bleu deposits, one flow per day, ascending. */
export function flowsOf(p: Pick<Portfolio, 'deposits' | 'cash'>): Flow[] {
  const byDay = new Map<string, number>();
  const add = (date: string, x: number) => byDay.set(date, (byDay.get(date) ?? 0) + x);
  for (const d of p.deposits) if (d.kind === 'new') add(d.date, d.amountEur);
  for (const c of p.cash) if (c.deposit) add(c.date, c.deposit);
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, x]) => ({ date, amountEur: round2(x) }));
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** `from`, then every 7 days, always ending with `to`. */
export function weeklyDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = utc(from); t < utc(to); t += 7 * DAY) out.push(iso(t));
  out.push(to);
  return out;
}

/**
 * Same euros, same dates: every flow is invested on its day and the whole pot is rebalanced to the weights only then.
 * Valued on adjusted closes (dividends reinvested). A leg without a price yet keeps its share as cash at 0%.
 */
export function simulateBenchmark(legs: { yahoo: string; weight: number }[], flows: Flow[], prices: EurSeries, dates: string[]): SeriesPoint[] {
  if (!flows.length || !legs.length) return [];
  const total = legs.reduce((s, l) => s + l.weight, 0);
  const units = new Map<string, number>();
  let cash = 0;
  const valueOn = (d: string) => cash + legs.reduce((s, l) => s + (units.get(l.yahoo) ?? 0) * (priceOn(prices[l.yahoo], d, 'adj') ?? 0), 0);

  const out: SeriesPoint[] = [];
  let i = 0;
  for (const d of dates) {
    for (; i < flows.length && flows[i].date <= d; i++) {
      const f = flows[i];
      const pot = valueOn(f.date) + f.amountEur;
      cash = 0;
      for (const l of legs) {
        const price = priceOn(prices[l.yahoo], f.date, 'adj');
        const share = (pot * l.weight) / total;
        if (price) units.set(l.yahoo, share / price);
        else { units.set(l.yahoo, 0); cash += share; }
      }
    }
    if (i > 0) out.push({ date: d, value: round2(valueOn(d)) });
  }
  return out;
}

/**
 * Yann's own value per date: exact from `plan.exactFrom` (units × close + IBKR cash + Livret Bleu), and before it a straight
 * line through the snapshots up to that exact value, marked approximate.
 */
export function youSeries(p: Portfolio, prices: Record<string, PriceSeries | null>, dates: string[]): { points: (SeriesPoint & { approx: boolean })[] } {
  const exact = (d: string) => {
    const q = holdings(p.trades, d);
    const value = Object.entries(q).reduce((s, [sym, n]) => {
      const last = p.trades.filter((t) => t.symbol === sym && t.date <= d && t.quantity).at(-1);
      const price = priceOn(prices[sym], d) ?? (last ? Math.abs(last.amountEur / last.quantity) : 0);
      return s + n * price;
    }, 0);
    return round2(value + ibkrCashEur(p, d) + livretOn(p.cash, d));
  };
  const from = p.plan.exactFrom;
  const anchors = [...p.snapshots.filter((s) => s.date < from).map((s) => ({ date: s.date, value: s.valueEur }))];
  const hasExact = p.trades.length > 0 || p.cash.length > 0;
  if (anchors.length && hasExact) anchors.push({ date: from, value: exact(from) });

  const points: (SeriesPoint & { approx: boolean })[] = [];
  for (const d of dates) {
    if (d >= from) {
      if (hasExact) points.push({ date: d, value: exact(d), approx: false });
      continue;
    }
    if (!anchors.length || d < anchors[0].date) continue;
    const j = anchors.findIndex((a) => a.date > d);
    if (j === -1) { points.push({ date: d, value: anchors.at(-1)!.value, approx: true }); continue; }
    const [a, b] = [anchors[j - 1], anchors[j]];
    const t = (utc(d) - utc(a.date)) / (utc(b.date) - utc(a.date));
    points.push({ date: d, value: round2(a.value + (b.value - a.value) * t), approx: true });
  }
  return { points };
}
