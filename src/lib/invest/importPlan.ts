import { toEur, type DailyRates } from '@/lib/fx/history';
import { DEFAULT_SYMBOLS } from './defaults';
import { holdings, ibkrCashEur } from './holdings';
import type { ParsedStatement } from './ibkr';
import { round2, type Deposit, type Dividend, type Portfolio, type SymbolInfo, type Trade } from './types';

export interface ImportResult {
  /** Rows not yet in the sheet. */
  trades: Trade[];
  /** Rows already in the sheet whose values this statement corrects (same key), e.g. a transfer's carried cost. */
  corrections: Trade[];
  deposits: Deposit[];
  dividends: Dividend[];
  duplicates: { trades: number; deposits: number; dividends: number };
  newSymbols: SymbolInfo[];
  positionMismatches: { symbol: string; sheet: number; statement: number }[];
  /** Cash the sheet implies after the import minus the statement's ending cash (EUR). */
  cashDiffEur: number | null;
  /** Some non-EUR row had no exchange rate; the caller must refuse the import. */
  missingRates: boolean;
  conversions: number;
  skipped: string[];
  period: { from: string; to: string } | null;
}

type Existing = Pick<Portfolio, 'trades' | 'deposits' | 'dividends' | 'symbols' | 'plan'>;

/** Parsed statement → the rows to append (deduped by key, EUR frozen at the day rate) plus the checks to show first. */
export function buildImport(stmt: ParsedStatement, existing: Existing, rates: DailyRates | null): ImportResult {
  const acc = stmt.account;
  let missingRates = false;
  const eur = (amount: number, currency: Trade['currency'], date: string) => {
    const v = toEur(amount, currency, date, rates);
    if (v === null) missingRates = true;
    return v;
  };
  const isin = (symbol: string) => stmt.instruments[symbol]?.isin ?? '';

  const trades: Trade[] = [];
  for (const t of stmt.trades) {
    const amountEur = eur(-t.proceeds + t.commission, t.currency, t.date);
    if (amountEur === null) continue;
    trades.push({
      key: `${acc}|${t.dateTime}|${t.symbol}|${t.quantity}`, date: t.date, account: acc, symbol: t.symbol, isin: isin(t.symbol),
      currency: t.currency, quantity: t.quantity, price: t.price, commission: t.commission, amountEur: round2(amountEur), source: 'ibkr', note: '',
    });
  }
  for (const x of stmt.transfers) {
    const carried = carriedCost(stmt, x);
    const amount = carried ?? x.marketValue;
    const amountEur = eur(amount, x.currency, x.date);
    if (amountEur === null) continue;
    const from = x.counterparty ? `${x.quantity < 0 ? 'to' : 'from'} ${x.counterparty}` : 'transfer';
    const worth = `worth ${new Intl.NumberFormat('en-US', { style: 'currency', currency: x.currency }).format(Math.abs(x.marketValue))} on the day`;
    trades.push({
      key: `${acc}|xfer|${x.date}|${x.symbol}|${x.quantity}`, date: x.date, account: acc, symbol: x.symbol, isin: isin(x.symbol),
      currency: x.currency, quantity: x.quantity, price: Math.round((amount / Math.abs(x.quantity)) * 1e6) / 1e6, commission: 0,
      amountEur: Math.sign(x.quantity) * Math.abs(round2(amountEur)), source: 'transfer',
      note: carried === null ? `${from} · at its value on the day` : `${from} · original cost ${x.quantity < 0 ? 'moved out' : 'carried over'} · ${worth}`,
    });
  }

  const seen = new Map<string, number>();
  const deposits: Deposit[] = [];
  for (const d of stmt.deposits) {
    const base = `${acc}|dep|${d.date}|${d.currency}|${d.amount}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const amountEur = eur(d.amount, d.currency, d.date);
    if (amountEur === null) continue;
    deposits.push({
      key: `${base}|${n}`, date: d.date, currency: d.currency, amount: d.amount, amountEur, source: 'ibkr',
      kind: d.date < existing.plan.internalBefore ? 'internal' : 'new', note: d.description,
    });
  }

  const dividends: Dividend[] = [];
  const divSeen = new Map<string, number>();
  for (const d of stmt.dividends) {
    const base = `${acc}|div|${d.date}|${d.symbol}|${d.currency}|${d.amount}`;
    const n = divSeen.get(base) ?? 0;
    divSeen.set(base, n + 1);
    const amountEur = eur(d.amount, d.currency, d.date);
    if (amountEur === null) continue;
    dividends.push({ key: `${base}|${n}`, date: d.date, symbol: d.symbol, currency: d.currency, amount: d.amount, amountEur });
  }
  for (const w of stmt.withholding) {
    const base = `${acc}|wht|${w.date}|${w.symbol}|${w.currency}|${w.amount}`;
    const n = divSeen.get(base) ?? 0;
    divSeen.set(base, n + 1);
    const amountEur = eur(w.amount, w.currency, w.date);
    if (amountEur === null) continue;
    dividends.push({ key: `${base}|${n}`, date: w.date, symbol: w.symbol, currency: w.currency, amount: w.amount, amountEur });
  }

  const fresh = <T extends { key: string }>(rows: T[], old: { key: string }[]) => {
    const keys = new Set(old.map((o) => o.key));
    return rows.filter((r) => !keys.has(r.key));
  };
  const byKey = new Map(existing.trades.map((t) => [t.key, t]));
  const corrections = trades.filter((t) => {
    const old = byKey.get(t.key);
    return !!old && (old.amountEur !== t.amountEur || old.price !== t.price || old.note !== t.note);
  });
  const add = { trades: fresh(trades, existing.trades), deposits: fresh(deposits, existing.deposits), dividends: freshDividends(dividends, existing.dividends) };

  const merged = { trades: [...existing.trades, ...add.trades], deposits: [...existing.deposits, ...add.deposits], dividends: [...existing.dividends, ...add.dividends] };
  const sheet = holdings(merged.trades.filter((t) => t.account === acc));
  const positionMismatches = [...new Set([...Object.keys(sheet), ...Object.keys(stmt.endingPositions)])]
    .map((symbol) => ({ symbol, sheet: sheet[symbol] ?? 0, statement: stmt.endingPositions[symbol] ?? 0 }))
    .filter((m) => Math.abs(m.sheet - m.statement) > 1e-6);

  const known = new Set(existing.symbols.map((s) => s.symbol));
  const newSymbols = Object.entries(stmt.instruments)
    .filter(([symbol]) => !known.has(symbol))
    .map(([symbol, i]): SymbolInfo => {
      const d = DEFAULT_SYMBOLS.find((s) => s.isin === i.isin);
      return d ? { ...d, symbol } : { symbol, isin: i.isin, yahoo: '', name: i.name, terPct: null, sri: false };
    });

  // The statement's closing cash is the truth; the gap to what the rows add up to is currency moves on cash and fees.
  const endingEur = stmt.baseCurrency && stmt.endingCashBase !== null && stmt.period
    ? eur(stmt.endingCashBase, stmt.baseCurrency, stmt.period.to)
    : stmt.endingCashEur;
  const cashDiffEur = endingEur === null ? null : round2(ibkrCashEur(merged, undefined, acc) - endingEur);
  const fxKey = stmt.period ? `${acc}|fx|${stmt.period.to}` : null;
  if (fxKey && cashDiffEur && !existing.deposits.some((d) => d.key === fxKey)) {
    add.deposits.push({
      key: fxKey, date: stmt.period!.to, currency: 'EUR', amount: -cashDiffEur, amountEur: -cashDiffEur, source: 'ibkr', kind: 'fx',
      note: 'currency moves on cash and fees, so cash matches the statement',
    });
  }

  return {
    ...add,
    corrections,
    duplicates: { trades: trades.length - add.trades.length, deposits: deposits.length - add.deposits.length, dividends: dividends.length - add.dividends.length },
    newSymbols,
    positionMismatches,
    cashDiffEur,
    missingRates,
    conversions: stmt.conversions,
    skipped: stmt.skipped,
    period: stmt.period,
  };
}

/**
 * Dividends are matched on content (day, symbol, currency, amount, and the how-many-th such row) rather than on key,
 * so a payment split into several rows is kept apart and rows imported under an older key format still count as present.
 */
function freshDividends(rows: Dividend[], old: Dividend[]): Dividend[] {
  const signatures = (xs: Dividend[]) => {
    const seen = new Map<string, number>();
    return xs.map((d) => {
      const sig = `${d.date}|${d.symbol}|${d.currency}|${d.amount}`;
      const n = seen.get(sig) ?? 0;
      seen.set(sig, n + 1);
      return `${sig}|${n}`;
    });
  };
  const present = new Set(signatures(old));
  const mine = signatures(rows);
  return rows.filter((_, i) => !present.has(mine[i]));
}

/**
 * What a transferred-in position originally cost, read off the statement: the ending cost basis minus the cost of the
 * symbol's buys in the same statement. Only when the arithmetic is unambiguous (no sells, quantities add up); else null.
 */
function carriedCost(stmt: ParsedStatement, x: ParsedStatement['transfers'][number]): number | null {
  const own = stmt.trades.filter((t) => t.symbol === x.symbol);
  if (own.some((t) => t.quantity < 0 || t.currency !== x.currency)) return null;
  if (stmt.transfers.some((t) => t.symbol === x.symbol && t !== x)) return null;
  const boughtQty = own.reduce((s, t) => s + t.quantity, 0);
  if (x.quantity < 0) {
    // Moving out everything this statement bought: the cost leaves with it.
    if ((stmt.endingPositions[x.symbol] ?? 0) !== 0 || Math.abs(boughtQty + x.quantity) > 1e-6) return null;
    const cost = own.reduce((s, t) => s + (-t.proceeds + t.commission), 0);
    return cost > 0 ? cost : null;
  }
  const end = stmt.endingCostBasis[x.symbol];
  const endQty = stmt.endingPositions[x.symbol];
  if (end === undefined || endQty === undefined) return null;
  if (Math.abs(endQty - boughtQty - x.quantity) > 1e-6) return null;
  const boughtCost = own.reduce((s, t) => s + (-t.proceeds + t.commission), 0);
  const cost = end - boughtCost;
  return cost > 0 ? cost : null;
}
