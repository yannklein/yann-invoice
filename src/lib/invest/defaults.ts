import { toRow, planToRows, type AppTab, type Cell } from './rows';
import type { BenchmarkLeg, CashRow, Deposit, PlanSettings, Slot, Snapshot, SymbolInfo } from './types';

export const DEFAULT_PLAN: PlanSettings = {
  buyMonths: [1, 7],
  perBuyEur: 5000,
  realReturnStocks: 0.05,
  realReturnBonds: 0.01,
  birthYear: null,
  internalBefore: '',
  exactFrom: '',
};

export const DEFAULT_SLOTS: Slot[] = [
  { slot: 'World', kind: 'stocks', targetPct: 55, holdSymbols: ['IWRD'], buySymbol: 'IWRD', sriSymbol: '2B7K', livret: false },
  { slot: 'Europe', kind: 'stocks', targetPct: 20, holdSymbols: ['IMEU'], buySymbol: 'IMEU', sriSymbol: 'IUSK', livret: false },
  { slot: 'Bonds', kind: 'bonds', targetPct: 25, holdSymbols: ['CSBGE3'], buySymbol: 'CSBGE3', sriSymbol: null, livret: true },
];

export const DEFAULT_SYMBOLS: SymbolInfo[] = [
  { symbol: 'IWRD', isin: 'IE00B0M62Q58', yahoo: 'IWRD.AS', name: 'iShares MSCI World (Dist)', terPct: 0.5, sri: false },
  { symbol: 'IMEU', isin: 'IE00B1YZSC51', yahoo: 'IMEU.AS', name: 'iShares Core MSCI Europe (Dist)', terPct: 0.12, sri: false },
  { symbol: 'CSBGE3', isin: 'IE00B3VTMJ91', yahoo: 'CSBGE3.SW', name: 'iShares € Govt Bond 1-3yr (Acc)', terPct: 0.07, sri: false },
  { symbol: '2B7K', isin: 'IE00BYX2JD69', yahoo: '2B7K.DE', name: 'iShares MSCI World SRI (EUR Acc)', terPct: 0.2, sri: true },
  { symbol: 'IUSK', isin: 'IE00B52VJ196', yahoo: 'IUSK.DE', name: 'iShares MSCI Europe SRI (EUR Acc)', terPct: 0.2, sri: true },
];

const BOOK = 'per book summary';
const leg = (benchmark: string, yahoo: string, weight: number, note = ''): BenchmarkLeg => ({ benchmark, yahoo, weight, note });

/** Yahoo symbols verified on 2026-10-17 with daily history back to Nov 2022. */
export const DEFAULT_BENCHMARKS: BenchmarkLeg[] = [
  leg('Hallam EU', 'VWCE.DE', 40, BOOK), leg('Hallam EU', 'IMEU.AS', 25, BOOK), leg('Hallam EU', 'IBGS.AS', 35, BOOK),
  leg('Hallam SRI', '2B7K.DE', 40, BOOK), leg('Hallam SRI', 'IUSK.DE', 25, BOOK), leg('Hallam SRI', 'IBGS.AS', 35, BOOK),
  leg('Hallam all-in-one', 'V60A.DE', 100, 'Vanguard LifeStrategy 60%'),
  leg('Buffett 90/10', 'SXR8.DE', 90, 'S&P 500'), leg('Buffett 90/10', 'IBGS.AS', 10, 'short govt bonds'),
  leg('All-Weather', 'VWCE.DE', 30), leg('All-Weather', 'IBGL.AS', 40), leg('All-Weather', 'IBGM.AS', 15),
  leg('All-Weather', '4GLD.DE', 7.5, 'gold'), leg('All-Weather', 'EXXY.DE', 7.5, 'commodities'),
  leg('Permanent', 'VWCE.DE', 25), leg('Permanent', 'IBGL.AS', 25), leg('Permanent', '4GLD.DE', 25, 'gold'), leg('Permanent', 'XEON.DE', 25, 'cash'),
  leg('All-in Berkshire', 'BRK-B', 100, 'USD'),
];

const seedDeposit = (date: string, amount: number, rate: number, note: string): Deposit => ({
  key: `sheet|dep|${date}|JPY|${amount}|0`, date, currency: 'JPY', amount,
  amountEur: Math.round((amount / rate) * 100) / 100, source: 'sheet', kind: 'closed', note: `${note} (ECB ${rate})`,
});

/**
 * Rakuten Securities, a closed account: what went in, kept as history. Yann restarted from scratch at IBKR in March 2025,
 * so Rakuten money is not part of today's portfolio. Its payout is a negative `closed` row once known.
 * 2022–2024 dates are inferred (Japan tab gives the month); Jan 2025 comes from the SBI Shinsei statement.
 */
export const SEED_DEPOSITS: Deposit[] = [
  seedDeposit('2022-12-01', 1_200_000, 142.48, 'Rakuten (Japan tab, date inferred)'),
  seedDeposit('2023-07-01', 1_200_000, 157.16, 'Rakuten (Japan tab, date inferred)'),
  seedDeposit('2024-01-01', 1_200_000, 156.33, 'Rakuten (Japan tab, date inferred)'),
  seedDeposit('2025-01-16', 500_000, 160.46, 'Rakuten Securities, from SBI Shinsei'),
  seedDeposit('2025-01-19', 500_000, 160.23, 'Rakuten Securities, from SBI Shinsei'),
];

export const SEED_SNAPSHOTS: Snapshot[] = [];

export const SEED_CASH: CashRow[] = [{ date: '2026-07-05', deposit: 4559.7, balance: 4559.7, note: 'Livret Bleu opening' }];

/** Data rows a freshly created tab starts with. */
export function defaultRowsFor(tab: AppTab): Cell[][] {
  switch (tab) {
    case 'Deposits': return SEED_DEPOSITS.map(toRow.deposits);
    case 'Cash': return SEED_CASH.map(toRow.cash);
    case 'Snapshots': return SEED_SNAPSHOTS.map(toRow.snapshots);
    case 'Plan': return planToRows(DEFAULT_PLAN);
    case 'Slots': return DEFAULT_SLOTS.map(toRow.slots);
    case 'Symbols': return DEFAULT_SYMBOLS.map(toRow.symbols);
    case 'Benchmarks': return DEFAULT_BENCHMARKS.map(toRow.benchmarks);
    default: return [];
  }
}

/** Seed rows of earlier versions: replaced by the bank and IBKR Japan statements. */
const RETIRED_DEPOSIT_KEYS = [
  'sheet|dep|2025-01-01|JPY|1000000|0', 'sheet|dep|2025-07-01|JPY|750000|0',
  'sheet|dep|2025-03-05|JPY|500000|0', 'sheet|dep|2025-04-08|JPY|500000|0', 'sheet|dep|2025-05-20|JPY|100000|0', 'sheet|dep|2025-05-27|JPY|360000|0',
];
const RETIRED_SNAPSHOTS: [string, number][] = [
  ['2022-12-01', 8422.23], ['2023-07-01', 15888.33], ['2024-01-01', 23228.73], ['2025-01-01', 33592.74], ['2025-01-20', 33946.65],
];
const RETIRED_PLAN: [string, string][] = [['internalBefore', '2026-07-06'], ['exactFrom', '2026-07-05']];

const cell = (x: unknown) => String(x ?? '').trim();
const byDate = (at: number) => (a: unknown[], b: unknown[]) => cell(a[at]).localeCompare(cell(b[at]));
const same = (a: unknown[][], b: unknown[][]) => JSON.stringify(a) === JSON.stringify(b);

export interface SeedTabs {
  deposits: unknown[][];
  snapshots: unknown[][];
  cash: unknown[][];
  plan: unknown[][];
}

/**
 * Bring an already-linked sheet to the current model, keeping every row the app did not seed:
 * - Rakuten deposits become `closed` history; the retired inferred rows go (the statements replaced them);
 * - IBKR deposits are money put in (`internal` → `new`), since the portfolio restarted from scratch at IBKR;
 * - the Livret Bleu opening balance is money put in; the Rakuten-era snapshots and plan dates go.
 * Idempotent.
 */
export function migrateSeeds(t: SeedTabs): SeedTabs & { changed: boolean } {
  const seedKeys = new Map(SEED_DEPOSITS.map((d) => [d.key, d]));
  const kept = t.deposits.filter((r) => !RETIRED_DEPOSIT_KEYS.includes(cell(r[0])));
  const deposits = kept.map((r) => {
    if (seedKeys.has(cell(r[0])) && cell(r[6]) !== 'closed') return [...r.slice(0, 6), 'closed', ...r.slice(7)];
    if (cell(r[5]) === 'ibkr' && cell(r[6]) === 'internal') return [...r.slice(0, 6), 'new', ...r.slice(7)];
    return r;
  });
  const present = new Set(deposits.map((r) => cell(r[0])));
  const missing = SEED_DEPOSITS.filter((d) => !present.has(d.key));
  if (missing.length) deposits.push(...missing.map(toRow.deposits));
  if (missing.length || deposits.length !== t.deposits.length) deposits.sort(byDate(1));

  const snapshots = t.snapshots.filter((r) => !RETIRED_SNAPSHOTS.some(([d, v]) => cell(r[0]) === d && Number(r[1]) === v));

  const first = [...t.cash].sort(byDate(0))[0];
  const cash = t.cash.map((r) =>
    r === first && !Number(r[1]) && cell(r[3]).includes('internal') ? [r[0], Number(r[2]), r[2], 'Livret Bleu opening'] : r,
  );

  const plan = t.plan.map((r) => (RETIRED_PLAN.some(([k, v]) => cell(r[0]) === k && cell(r[1]) === v) ? [r[0], ''] : r));

  const changed = !same(deposits, t.deposits) || !same(snapshots, t.snapshots) || !same(cash, t.cash) || !same(plan, t.plan);
  return { deposits, snapshots, cash, plan, changed };
}
