import { toRow, planToRows, type AppTab, type Cell } from './rows';
import type { BenchmarkLeg, CashRow, Deposit, PlanSettings, Slot, Snapshot, SymbolInfo } from './types';

export const DEFAULT_PLAN: PlanSettings = {
  buyMonths: [1, 7],
  perBuyEur: 5000,
  realReturnStocks: 0.05,
  realReturnBonds: 0.01,
  birthYear: null,
  internalBefore: '2026-07-06',
  exactFrom: '2026-07-05',
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
  amountEur: Math.round((amount / rate) * 100) / 100, source: 'sheet', kind: 'new', note: `${note} (ECB ${rate})`,
});

/** The only new money before the IBKR Ireland exports (dates inferred from the Stock mix sheet). */
export const SEED_DEPOSITS: Deposit[] = [
  seedDeposit('2022-12-01', 1_200_000, 142.48, 'Rakuten (Japan tab)'),
  seedDeposit('2023-07-01', 1_200_000, 157.16, 'Rakuten (Japan tab)'),
  seedDeposit('2024-01-01', 1_200_000, 156.33, 'Rakuten (Japan tab)'),
  seedDeposit('2025-01-01', 1_000_000, 163.06, 'Rakuten (Japan tab)'),
  seedDeposit('2025-07-01', 750_000, 168.7, 'IBKR Japan, date inferred'),
];

export const SEED_SNAPSHOTS: Snapshot[] = [
  { date: '2022-12-01', valueEur: 8422.23, note: '¥1,200,000 first Rakuten buy' },
  { date: '2023-07-01', valueEur: 15888.33, note: '¥2,497,010 (Japan tab, after Jul 2023 buy)' },
  { date: '2024-01-01', valueEur: 23228.73, note: '¥3,631,348 incl. UBS (Japan tab)' },
  { date: '2025-01-01', valueEur: 33592.74, note: '¥5,477,632 incl. UBS (Japan tab)' },
];

export const SEED_CASH: CashRow[] = [{ date: '2026-07-05', deposit: 0, balance: 4559.7, note: 'Livret Bleu, Rakuten money (internal)' }];

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
