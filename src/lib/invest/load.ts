import { fetchDailyRates } from '@/lib/fx/history';
import type { Google } from '@/lib/google/client';
import { moneyBreakdown, type MoneyBreakdown } from './breakdown';
import { holdings } from './holdings';
import { fetchSeries, type PriceSeries } from './prices';
import { flowsOf } from './simulate';
import { stockSummary } from './stocks';
import { findPortfolioId, readPortfolio } from './store';
import type { Portfolio } from './types';
import { buildView, quotesFor, type InvestView } from './view';

const minusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Today's money across IBKR and the Livret Bleu (two weeks of quotes is plenty), or null when no portfolio sheet is linked. */
export async function loadMoneyToday(g: Google, today: string): Promise<MoneyBreakdown | null> {
  const id = await findPortfolioId(g.drive);
  if (!id) return null;
  const p = await readPortfolio(g.sheets, id);
  const from = minusDays(today, 14);
  const yahoo = new Map(p.symbols.map((s) => [s.symbol, s.yahoo]));
  const symbols = [...new Set(Object.keys(holdings(p.trades)).map((s) => yahoo.get(s) ?? '').filter(Boolean))];
  const [rates, ...series] = await Promise.all([fetchDailyRates(from, today), ...symbols.map((y) => fetchSeries(y, from, today))]);
  const { quotes } = quotesFor(p, Object.fromEntries(symbols.map((y, i) => [y, series[i]])), rates, today);
  return moneyBreakdown(p, stockSummary(p, quotes).valueEur, today);
}

/** The whole /invest model: prices from the first money in (for the history and the legends), or null without a portfolio sheet. */
export async function loadInvestView(g: Google, today: string, amountOverride: number | null): Promise<{ id: string; p: Portfolio; v: InvestView } | null> {
  const id = await findPortfolioId(g.drive);
  if (!id) return null;
  const p = await readPortfolio(g.sheets, id);
  const firstDate = [flowsOf(p)[0]?.date, p.snapshots[0]?.date, p.trades[0]?.date, today].filter((d): d is string => !!d).sort()[0];
  const from = minusDays(firstDate, 7);
  const bySymbol = new Map(p.symbols.map((s) => [s.symbol, s.yahoo]));
  const wanted = [...Object.keys(holdings(p.trades)), ...p.slots.flatMap((s) => [s.buySymbol, s.sriSymbol ?? ''])].map((s) => bySymbol.get(s) ?? '');
  const yahoos = [...new Set([...wanted, ...p.benchmarks.map((b) => b.yahoo)].filter(Boolean))];
  const [rates, ...fetched] = await Promise.all([fetchDailyRates(from, today), ...yahoos.map((y) => fetchSeries(y, from, today))]);
  const series: Record<string, PriceSeries | null> = Object.fromEntries(yahoos.map((y, i) => [y, fetched[i]]));
  return { id, p, v: buildView(p, series, rates, today, amountOverride) };
}
