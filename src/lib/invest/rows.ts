import { DEFAULT_PLAN } from './defaults';
import type { BenchmarkLeg, CashRow, Ccy, Deposit, Dividend, PlanSettings, Portfolio, Slot, Snapshot, SymbolInfo, Trade } from './types';

export type AppTab = 'Trades' | 'Deposits' | 'Dividends' | 'Cash' | 'Snapshots' | 'Plan' | 'Slots' | 'Symbols' | 'Benchmarks';
export const APP_TABS: AppTab[] = ['Trades', 'Deposits', 'Dividends', 'Cash', 'Snapshots', 'Plan', 'Slots', 'Symbols', 'Benchmarks'];

export const HEADERS: Record<AppTab, string[]> = {
  Trades: ['key', 'date', 'account', 'symbol', 'isin', 'currency', 'quantity', 'price', 'commission', 'amountEur', 'source', 'note'],
  Deposits: ['key', 'date', 'currency', 'amount', 'amountEur', 'source', 'kind', 'note'],
  Dividends: ['key', 'date', 'symbol', 'currency', 'amount', 'amountEur'],
  Cash: ['date', 'deposit', 'balance', 'note'],
  Snapshots: ['date', 'valueEur', 'note'],
  Plan: ['key', 'value'],
  Slots: ['slot', 'kind', 'targetPct', 'holdSymbols', 'buySymbol', 'sriSymbol', 'livret'],
  Symbols: ['symbol', 'isin', 'yahoo', 'name', 'terPct', 'sri'],
  Benchmarks: ['benchmark', 'yahoo', 'weight', 'note'],
};

export type Cell = string | number;
const str = (x: unknown) => String(x ?? '').trim();
const num = (x: unknown) => (str(x) === '' ? NaN : Number(str(x)));
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isDate = (s: string) => DATE_RE.test(s);
const isCcy = (s: string): s is Ccy => s === 'EUR' || s === 'USD' || s === 'JPY';
/** A cell holding a date: ISO text as written by the app, or a Sheets serial when Yann typed a date by hand. */
const day = (x: unknown) =>
  typeof x === 'number' && x > 20000 && x < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(x) * 86_400_000).toISOString().slice(0, 10) : str(x);
const cellsWithDate = (v: unknown[], at: number) => v.map((c, i) => (i === at ? day(c) : str(c)));
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const yn = (b: boolean) => (b ? 'y' : 'n');
const fin = (...xs: number[]) => xs.every(Number.isFinite);

export const toRow = {
  trades: (t: Trade): Cell[] => [t.key, t.date, t.account, t.symbol, t.isin, t.currency, t.quantity, t.price, t.commission, t.amountEur, t.source, t.note],
  deposits: (d: Deposit): Cell[] => [d.key, d.date, d.currency, d.amount, d.amountEur, d.source, d.kind, d.note],
  dividends: (d: Dividend): Cell[] => [d.key, d.date, d.symbol, d.currency, d.amount, d.amountEur],
  cash: (c: CashRow): Cell[] => [c.date, c.deposit, c.balance, c.note],
  snapshots: (s: Snapshot): Cell[] => [s.date, s.valueEur, s.note],
  slots: (s: Slot): Cell[] => [s.slot, s.kind, s.targetPct, s.holdSymbols.join(','), s.buySymbol, s.sriSymbol ?? '', yn(s.livret)],
  symbols: (s: SymbolInfo): Cell[] => [s.symbol, s.isin, s.yahoo, s.name, s.terPct ?? '', yn(s.sri)],
  benchmarks: (b: BenchmarkLeg): Cell[] => [b.benchmark, b.yahoo, b.weight, b.note],
};

export const fromRow = {
  trades(v: unknown[]): Trade | null {
    const [key, date, account, symbol, isin, currency, q, p, c, a, source, note] = cellsWithDate(v, 1);
    const [quantity, price, commission, amountEur] = [num(q), num(p), num(c || 0), num(a)];
    if (!key || !isDate(date ?? '') || !symbol || !isCcy(currency ?? '') || !fin(quantity, price, commission, amountEur)) return null;
    if (source !== 'ibkr' && source !== 'transfer' && source !== 'manual') return null;
    return { key, date, account: account ?? '', symbol, isin: isin ?? '', currency: currency as Ccy, quantity, price, commission, amountEur, source, note: note ?? '' };
  },
  deposits(v: unknown[]): Deposit | null {
    const [key, date, currency, a, e, source, kind, note] = cellsWithDate(v, 1);
    const [amount, amountEur] = [num(a), num(e)];
    if (!key || !isDate(date ?? '') || !isCcy(currency ?? '') || !fin(amount, amountEur)) return null;
    if ((source !== 'ibkr' && source !== 'sheet') || !['new', 'internal', 'closed', 'fx'].includes(kind ?? '')) return null;
    return { key, date, currency: currency as Ccy, amount, amountEur, source, kind: kind as Deposit['kind'], note: note ?? '' };
  },
  dividends(v: unknown[]): Dividend | null {
    const [key, date, symbol, currency, a, e] = cellsWithDate(v, 1);
    const [amount, amountEur] = [num(a), num(e)];
    if (!key || !isDate(date ?? '') || !symbol || !isCcy(currency ?? '') || !fin(amount, amountEur)) return null;
    return { key, date, symbol, currency: currency as Ccy, amount, amountEur };
  },
  cash(v: unknown[]): CashRow | null {
    const [date, d, b, note] = cellsWithDate(v, 0);
    const [deposit, balance] = [num(d || 0), num(b)];
    if (!isDate(date ?? '') || !fin(deposit, balance)) return null;
    return { date, deposit, balance, note: note ?? '' };
  },
  snapshots(v: unknown[]): Snapshot | null {
    const [date, val, note] = cellsWithDate(v, 0);
    const valueEur = num(val);
    if (!isDate(date ?? '') || !fin(valueEur)) return null;
    return { date, valueEur, note: note ?? '' };
  },
  slots(v: unknown[]): Slot | null {
    const [slot, kind, t, hold, buySymbol, sri, livret] = v.map(str);
    const targetPct = num(t);
    if (!slot || (kind !== 'stocks' && kind !== 'bonds') || !fin(targetPct) || !buySymbol) return null;
    return { slot, kind, targetPct, holdSymbols: list(hold ?? ''), buySymbol, sriSymbol: sri || null, livret: livret === 'y' };
  },
  symbols(v: unknown[]): SymbolInfo | null {
    const [symbol, isin, yahoo, name, ter, sri] = v.map(str);
    if (!symbol) return null;
    const terPct = ter ? num(ter) : null;
    return { symbol, isin: isin ?? '', yahoo: yahoo ?? '', name: name ?? '', terPct: terPct !== null && Number.isFinite(terPct) ? terPct : null, sri: sri === 'y' };
  },
  benchmarks(v: unknown[]): BenchmarkLeg | null {
    const [benchmark, yahoo, w, note] = v.map(str);
    const weight = num(w);
    if (!benchmark || !yahoo || !(weight > 0)) return null;
    return { benchmark, yahoo, weight, note: note ?? '' };
  },
};

/** Buy months from "1,7", "1;7" or "1 7" (or a single whole number); null when the cell is not that. */
function monthsOf(x: unknown): number[] | null {
  if (typeof x === 'number') return Number.isInteger(x) && x >= 1 && x <= 12 ? [x] : null;
  const parts = str(x).split(/[,;\s]+/).filter(Boolean);
  const months = parts.map(Number);
  return months.length && months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) ? months : null;
}

/**
 * Plan keys whose cell holds something unusable, e.g. buyMonths typed as 1,7 in a comma-decimal sheet (stored as 1.7).
 * Those keys fall back to their defaults, and the page reports them instead of guessing silently.
 */
export function invalidPlanKeys(rows: unknown[][]): string[] {
  const bad: string[] = [];
  for (const [k, v] of rows.map((r) => [str(r[0]), r[1]] as const)) {
    const blank = str(v) === '';
    const ok =
      k === 'buyMonths' ? monthsOf(v) !== null
      : k === 'perBuyEur' || k === 'realReturnStocks' || k === 'realReturnBonds' ? Number.isFinite(num(v))
      : k === 'birthYear' ? blank || (Number.isInteger(num(v)) && num(v) > 1900)
      : k === 'internalBefore' || k === 'exactFrom' ? blank || isDate(day(v))
      : true;
    if (!ok) bad.push(k);
  }
  return bad;
}

export function planToRows(p: PlanSettings): Cell[][] {
  return [
    ['buyMonths', p.buyMonths.join(',')],
    ['perBuyEur', p.perBuyEur],
    ['realReturnStocks', p.realReturnStocks],
    ['realReturnBonds', p.realReturnBonds],
    ['birthYear', p.birthYear ?? ''],
    ['internalBefore', p.internalBefore],
    ['exactFrom', p.exactFrom],
  ];
}

/** Plan key/value rows; any missing or unparseable key keeps its default. */
export function planFromRows(rows: unknown[][]): PlanSettings {
  const raw = new Map(rows.map((r) => [str(r[0]), r[1]]));
  const kv = new Map([...raw].map(([k, v]) => [k, str(v)]));
  const n = (k: string, d: number) => (Number.isFinite(num(kv.get(k))) ? num(kv.get(k)) : d);
  const date = (k: 'internalBefore' | 'exactFrom') => (isDate(day(raw.get(k))) ? day(raw.get(k)) : raw.has(k) && str(raw.get(k)) === '' ? '' : DEFAULT_PLAN[k]);
  const months = monthsOf(raw.get('buyMonths'));
  const birth = num(kv.get('birthYear'));
  return {
    buyMonths: months ?? DEFAULT_PLAN.buyMonths,
    perBuyEur: n('perBuyEur', DEFAULT_PLAN.perBuyEur),
    realReturnStocks: n('realReturnStocks', DEFAULT_PLAN.realReturnStocks),
    realReturnBonds: n('realReturnBonds', DEFAULT_PLAN.realReturnBonds),
    birthYear: Number.isInteger(birth) && birth > 1900 ? birth : null,
    internalBefore: date('internalBefore'),
    exactFrom: date('exactFrom'),
  };
}

const nonBlank = (r: unknown[]) => r.some((c) => str(c) !== '');

/** Every app tab's data rows (header excluded) → typed portfolio. Rows that do not parse are counted, never guessed. */
export function parsePortfolio(raw: Record<AppTab, unknown[][]>): Portfolio {
  let invalidRows = 0;
  const parse = <T,>(rows: unknown[][] | undefined, f: (v: unknown[]) => T | null): T[] => {
    const out: T[] = [];
    for (const r of (rows ?? []).filter(nonBlank)) {
      const x = f(r);
      if (x) out.push(x);
      else invalidRows++;
    }
    return out;
  };
  const byDate = <T extends { date: string }>(xs: T[]) => xs.sort((a, b) => a.date.localeCompare(b.date));
  const p = {
    trades: byDate(parse(raw.Trades, fromRow.trades)),
    deposits: byDate(parse(raw.Deposits, fromRow.deposits)),
    dividends: byDate(parse(raw.Dividends, fromRow.dividends)),
    cash: byDate(parse(raw.Cash, fromRow.cash)),
    snapshots: byDate(parse(raw.Snapshots, fromRow.snapshots)),
    plan: planFromRows((raw.Plan ?? []).filter(nonBlank)),
    slots: parse(raw.Slots, fromRow.slots),
    symbols: parse(raw.Symbols, fromRow.symbols),
    benchmarks: parse(raw.Benchmarks, fromRow.benchmarks),
  };
  return { ...p, invalidRows: invalidRows + invalidPlanKeys((raw.Plan ?? []).filter(nonBlank)).length };
}
