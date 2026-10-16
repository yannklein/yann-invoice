import { toEur, type DailyRates } from '@/lib/fx/history';
import { DEFAULT_SYMBOLS } from './defaults';
import { holdings, ibkrCashEur } from './holdings';
import type { ParsedStatement } from './ibkr';
import { round2, type Deposit, type Dividend, type Portfolio, type SymbolInfo, type Trade } from './types';

export interface ImportResult {
  /** Rows not yet in the sheet. */
  trades: Trade[];
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
    const amountEur = eur(x.marketValue, x.currency, x.date);
    if (amountEur === null) continue;
    trades.push({
      key: `${acc}|xfer|${x.date}|${x.symbol}|${x.quantity}`, date: x.date, account: acc, symbol: x.symbol, isin: isin(x.symbol),
      currency: x.currency, quantity: x.quantity, price: Math.round((x.marketValue / Math.abs(x.quantity)) * 1e6) / 1e6, commission: 0,
      amountEur: Math.sign(x.quantity) * Math.abs(amountEur), source: 'transfer', note: x.counterparty ? `from ${x.counterparty}` : '',
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
  for (const d of stmt.dividends) {
    const amountEur = eur(d.amount, d.currency, d.date);
    if (amountEur === null) continue;
    dividends.push({ key: `${acc}|div|${d.date}|${d.symbol}|${d.currency}`, date: d.date, symbol: d.symbol, currency: d.currency, amount: d.amount, amountEur });
  }

  const fresh = <T extends { key: string }>(rows: T[], old: { key: string }[]) => {
    const keys = new Set(old.map((o) => o.key));
    return rows.filter((r) => !keys.has(r.key));
  };
  const add = { trades: fresh(trades, existing.trades), deposits: fresh(deposits, existing.deposits), dividends: fresh(dividends, existing.dividends) };

  const merged = { trades: [...existing.trades, ...add.trades], deposits: [...existing.deposits, ...add.deposits], dividends: [...existing.dividends, ...add.dividends] };
  const sheet = holdings(merged.trades);
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

  return {
    ...add,
    duplicates: { trades: trades.length - add.trades.length, deposits: deposits.length - add.deposits.length, dividends: dividends.length - add.dividends.length },
    newSymbols,
    positionMismatches,
    cashDiffEur: stmt.endingCashEur === null ? null : round2(ibkrCashEur(merged) - stmt.endingCashEur),
    missingRates,
    conversions: stmt.conversions,
    skipped: stmt.skipped,
    period: stmt.period,
  };
}
