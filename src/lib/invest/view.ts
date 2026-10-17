import { dailyRateFor, type DailyRates } from '@/lib/fx/history';
import { closedHistory, moneyBreakdown, type ClosedHistory, type MoneyBreakdown } from './breakdown';
import { holdings, ibkrCashEur, livretOn, nextBuyDate, rebalance, slotValues } from './holdings';
import type { PriceSeries } from './prices';
import { blendedReturn, buffettHorizon, project } from './projection';
import { badges, lazyStreak, quips, scoreboardQuip, type Badge } from './quips';
import { flowsOf, simulateBenchmark, weeklyDates, youSeries, type SeriesPoint } from './simulate';
import { round2, type Portfolio, type SymbolInfo, type Trade } from './types';

export interface Quote {
  symbol: string;
  priceEur: number;
  date: string;
  stale: boolean;
}

export interface InvestView {
  today: string;
  nextBuy: { date: string; days: number } | null;
  lazyDays: number | null;
  badges: Badge[];
  quips: string[];
  valueEur: number;
  investedEur: number;
  /** Where today's money comes from; adds up to valueEur. */
  breakdown: MoneyBreakdown;
  /** Rakuten, kept as history outside today's money. */
  closed: ClosedHistory | null;
  ibkrCashEur: number;
  livretEur: number;
  round: {
    amountEur: number;
    fromCashEur: number;
    lines: { slot: string; nowPct: number; targetPct: number; buyEur: number; symbol: string; units: number | null; stale: boolean }[];
    driftNote: boolean;
  };
  unassigned: string[];
  quotes: Quote[];
  sri: { slot: string; current: SymbolInfo | null; candidate: SymbolInfo | null; usingSri: boolean }[];
  sriSharePct: number;
  longGame: { perBuyEur: number; buysPerYear: number; realReturn: number; startEur: number; buffettYears: number | null };
  legends: { name: string; bookWeights: boolean; points: SeriesPoint[]; valueEur: number | null; diffVsYou: number | null; quip: string }[];
  you: (SeriesPoint & { approx: boolean })[];
  trades: Trade[];
  invalidRows: number;
  missingSeries: string[];
}

const STALE_DAYS = 5;
const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** A series in EUR: EUR passes through, USD/JPY convert per day at the ECB rate; anything else is unusable. */
function inEur(s: PriceSeries | null | undefined, rates: DailyRates | null): PriceSeries | null {
  if (!s) return null;
  if (s.currency === 'EUR') return s;
  if ((s.currency !== 'USD' && s.currency !== 'JPY') || !rates) return null;
  const c = s.currency;
  const points = s.points.flatMap((p) => {
    const r = dailyRateFor(rates, p.date, c);
    return r ? [{ date: p.date, close: p.close / r, adj: p.adj / r }] : [];
  });
  return points.length ? { ...s, currency: 'EUR', points } : null;
}

/** Latest EUR price of everything held or buyable: the last Yahoo close, else the last trade price (stale). */
export function quotesFor(
  p: Pick<Portfolio, 'trades' | 'slots' | 'symbols'>, series: Record<string, PriceSeries | null>, rates: DailyRates | null, today: string,
): { quotes: Quote[]; ownSeries: Record<string, PriceSeries | null>; missing: string[] } {
  const bySymbol = new Map(p.symbols.map((s) => [s.symbol, s]));
  const missing: string[] = [];
  const wanted = new Set([...Object.keys(holdings(p.trades)), ...p.slots.flatMap((s) => [s.buySymbol, ...(s.sriSymbol ? [s.sriSymbol] : [])])]);
  const ownSeries: Record<string, PriceSeries | null> = {};
  const quotes: Quote[] = [];
  for (const symbol of wanted) {
    const yahoo = bySymbol.get(symbol)?.yahoo;
    const s = yahoo ? inEur(series[yahoo], rates) : null;
    if (yahoo && !s) missing.push(yahoo);
    ownSeries[symbol] = s;
    const last = s?.points.at(-1);
    if (last) {
      quotes.push({ symbol, priceEur: last.close, date: last.date, stale: (utc(today) - utc(last.date)) / DAY > STALE_DAYS });
      continue;
    }
    const t = p.trades.filter((x) => x.symbol === symbol && x.quantity).at(-1);
    if (t) quotes.push({ symbol, priceEur: round2(Math.abs(t.amountEur / t.quantity)), date: t.date, stale: true });
  }
  return { quotes, ownSeries, missing };
}

/** Everything the /invest page shows, from the sheet, Yahoo series (keyed by Yahoo symbol) and ECB day rates. */
export function buildView(p: Portfolio, series: Record<string, PriceSeries | null>, rates: DailyRates | null, today: string, amountOverride: number | null): InvestView {
  const bySymbol = new Map(p.symbols.map((s) => [s.symbol, s]));
  const { quotes, ownSeries, missing } = quotesFor(p, series, rates, today);
  const missingSeries = new Set(missing);
  const eurSeries = (yahoo: string) => {
    const s = inEur(series[yahoo], rates);
    if (!s) missingSeries.add(yahoo);
    return s;
  };
  const held = holdings(p.trades);
  const quote = (symbol: string) => quotes.find((q) => q.symbol === symbol);

  // Value now.
  const values = Object.fromEntries(Object.entries(held).map(([s, q]) => [s, round2(q * (quote(s)?.priceEur ?? 0))]));
  const cash = ibkrCashEur(p);
  const livret = livretOn(p.cash, today);
  const { slots, unassigned } = slotValues(p.slots, values, livret);
  const holdingsValue = Object.values(values).reduce((a, b) => a + b, 0);
  const valueEur = round2(holdingsValue + cash + livret);
  const flows = flowsOf(p);
  const investedEur = round2(flows.reduce((s, f) => s + f.amountEur, 0));

  // This round.
  const fromCashEur = Math.max(0, cash);
  const amountEur = amountOverride ?? round2(p.plan.perBuyEur + fromCashEur);
  const slotTotal = slots.reduce((s, x) => s + x.valueEur, 0);
  const buys = rebalance(slots, amountEur);
  const lines = p.slots.map((s, i) => {
    const q = quote(s.buySymbol);
    const nowPct = slotTotal ? (slots[i].valueEur / slotTotal) * 100 : 0;
    return {
      slot: s.slot, nowPct: Math.round(nowPct * 10) / 10, targetPct: Math.round(slots[i].weight * 1000) / 10, buyEur: buys[i].buyEur, symbol: s.buySymbol,
      units: q && q.priceEur > 0 ? round4(buys[i].buyEur / q.priceEur) : null, stale: q?.stale ?? true,
    };
  });
  const driftPts = slotTotal ? lines.map((l) => l.nowPct - l.targetPct) : [];

  // SRI path.
  const sri = p.slots.map((s) => {
    const candidate = s.sriSymbol ? bySymbol.get(s.sriSymbol) ?? null : null;
    return { slot: s.slot, current: bySymbol.get(s.buySymbol) ?? null, candidate, usingSri: !!candidate && s.buySymbol === s.sriSymbol };
  });
  const sriValue = Object.entries(values).filter(([s]) => bySymbol.get(s)?.sri).reduce((a, [, v]) => a + v, 0);
  const sriSharePct = holdingsValue > 0 ? Math.round((sriValue / holdingsValue) * 1000) / 10 : 0;

  // Long game.
  const buysPerYear = p.plan.buyMonths.length || 1;
  const realReturn = blendedReturn(p.slots, p.plan.realReturnStocks, p.plan.realReturnBonds);
  const buffettYears = buffettHorizon(p.plan.birthYear, today);
  const longGame = { perBuyEur: p.plan.perBuyEur, buysPerYear, realReturn, startEur: valueEur, buffettYears };
  const projection = (years: number) => project({ startEur: valueEur, perBuyEur: p.plan.perBuyEur, buysPerYear, realReturn }, [years])[0].valueEur;

  // History and legends.
  const start = [flows[0]?.date, p.snapshots[0]?.date, p.trades[0]?.date].filter((d): d is string => !!d).sort()[0];
  const dates = start && start <= today ? weeklyDates(start, today) : [];
  const you = youSeries(p, ownSeries, dates).points;
  const groups = new Map<string, { yahoo: string; weight: number; note: string }[]>();
  for (const l of p.benchmarks) groups.set(l.benchmark, [...(groups.get(l.benchmark) ?? []), l]);
  const legends = [...groups].map(([name, legs]) => {
    const prices = Object.fromEntries(legs.flatMap((l) => {
      const s = eurSeries(l.yahoo);
      return s ? [[l.yahoo, s]] : [];
    }));
    const points = simulateBenchmark(legs, flows, prices, dates);
    const last = points.at(-1)?.value ?? null;
    const diffVsYou = last === null ? null : round2(last - valueEur);
    return { name, bookWeights: legs.some((l) => l.note.includes('book')), points, valueEur: last, diffVsYou, quip: diffVsYou === null ? '' : scoreboardQuip(name, diffVsYou) };
  });

  // Fun.
  const buysByYann = p.trades.filter((t) => t.source !== 'transfer' && t.quantity > 0);
  const lastTradeDate = buysByYann.at(-1)?.date ?? null;
  let peak = 0;
  let boughtInDrawdown = false;
  for (const pt of you) {
    peak = Math.max(peak, pt.value);
    if (peak > 0 && pt.value <= peak * 0.9 && buysByYann.some((t) => t.date <= pt.date && utc(pt.date) - utc(t.date) < 7 * DAY)) boughtInDrawdown = true;
  }
  const ctx = {
    today, youValue: valueEur, invested: investedEur, lastTradeDate, driftPts, boughtInDrawdown,
    projection40: projection(40), buffettAgeValue: buffettYears ? projection(buffettYears) : null, buffettAge: buffettYears,
    legends: legends.filter((l) => l.valueEur !== null).map((l) => ({ name: l.name, value: l.valueEur! })),
  };

  return {
    today, nextBuy: nextBuyDate(today, p.plan.buyMonths), lazyDays: lazyStreak(today, lastTradeDate), badges: badges(ctx), quips: quips(ctx),
    valueEur, investedEur, breakdown: moneyBreakdown(p, holdingsValue, today), closed: closedHistory(p), ibkrCashEur: cash, livretEur: livret,
    round: { amountEur, fromCashEur, lines, driftNote: driftPts.some((d) => Math.abs(d) > 10) },
    unassigned, quotes, sri, sriSharePct, longGame, legends, you,
    trades: p.trades, invalidRows: p.invalidRows, missingSeries: [...missingSeries],
  };
}
