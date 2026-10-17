export type Ccy = 'EUR' | 'USD' | 'JPY';

export const round2 = (x: number) => Math.round(x * 100) / 100;

/** One execution (or position transfer). `amountEur` = EUR cash cost: buys positive, sells negative, commission included. */
export interface Trade {
  key: string;
  date: string;
  account: string;
  symbol: string;
  isin: string;
  currency: Ccy;
  quantity: number;
  price: number;
  commission: number;
  amountEur: number;
  source: 'ibkr' | 'transfer' | 'manual';
  note: string;
}

/**
 * Money into (or out of) an account. `new` is money put in (negative = taken out); `internal` is money moved between pots;
 * `closed` belongs to a closed account (Rakuten) and is history only; `fx` books currency moves and fees so cash matches
 * the statement.
 */
export interface Deposit {
  key: string;
  date: string;
  currency: Ccy;
  amount: number;
  amountEur: number;
  source: 'ibkr' | 'sheet';
  kind: 'new' | 'internal' | 'closed' | 'fx';
  note: string;
}

export interface Dividend {
  key: string;
  date: string;
  symbol: string;
  currency: Ccy;
  amount: number;
  amountEur: number;
}

/** Livret Bleu balance (EUR). `deposit` is new money paid in that day. */
export interface CashRow {
  date: string;
  deposit: number;
  balance: number;
  note: string;
}

/** Whole-portfolio value from before the IBKR exports. */
export interface Snapshot {
  date: string;
  valueEur: number;
  note: string;
}

export interface PlanSettings {
  buyMonths: number[];
  perBuyEur: number;
  realReturnStocks: number;
  realReturnBonds: number;
  birthYear: number | null;
  /** Imported deposits dated before this are internal moves (Rakuten money), later ones new money. */
  internalBefore: string;
  /** "You" is exact from this date on, interpolated from snapshots before it. */
  exactFrom: string;
}

export interface Slot {
  slot: string;
  kind: 'stocks' | 'bonds';
  targetPct: number;
  holdSymbols: string[];
  buySymbol: string;
  sriSymbol: string | null;
  livret: boolean;
}

export interface SymbolInfo {
  symbol: string;
  isin: string;
  yahoo: string;
  name: string;
  terPct: number | null;
  sri: boolean;
}

export interface BenchmarkLeg {
  benchmark: string;
  yahoo: string;
  weight: number;
  note: string;
}

export interface Portfolio {
  trades: Trade[];
  deposits: Deposit[];
  dividends: Dividend[];
  cash: CashRow[];
  snapshots: Snapshot[];
  plan: PlanSettings;
  slots: Slot[];
  symbols: SymbolInfo[];
  benchmarks: BenchmarkLeg[];
  invalidRows: number;
}
