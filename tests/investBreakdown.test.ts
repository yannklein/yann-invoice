import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moneyBreakdown } from '@/lib/invest/breakdown';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS, SEED_CASH, SEED_DEPOSITS, SEED_SNAPSHOTS } from '@/lib/invest/defaults';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';
import type { Portfolio } from '@/lib/invest/types';

// The real sheet on 2026-10-17: seeded yen-era history, the 2026 statement, €700 taken out of the Livret Bleu.
const stmt = parseIbkrCsv(readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8'));
const rates = { '2026-03-31': { USD: 1.14 }, '2026-06-30': { USD: 1.14 }, '2026-09-30': { USD: 1.14 } };
const base = { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN };
const imp = buildImport(stmt, base, rates);
const p: Portfolio = {
  trades: imp.trades, deposits: [...SEED_DEPOSITS, ...imp.deposits], dividends: imp.dividends,
  cash: [...SEED_CASH, { date: '2026-10-17', deposit: 0, balance: 3859.7, note: '' }], snapshots: SEED_SNAPSHOTS,
  plan: DEFAULT_PLAN, slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: DEFAULT_BENCHMARKS, invalidRows: 0,
};
const FUNDS = 38011; // value of the three funds at the latest prices

describe('moneyBreakdown', () => {
  const b = moneyBreakdown(p, FUNDS, '2026-10-17');
  it('splits today\'s money into where it came from', () => {
    expect(b.todayEur).toBeCloseTo(38011 + 90.86 + 3859.7, 2);
    expect(b.newMoneyEur).toBeCloseTo(39019.9 - 700, 2);
    expect(b.stockGainEur).toBeCloseTo(38011 - 33044.86, 2); // what IBKR calls unrealized P/L
    expect(b.dividendsEur).toBeCloseTo(267.87, 2);
    expect(b.interestEur).toBe(0);
    expect(b.earlierEur).toBeCloseTo(20167.85 + 12700 + 4559.7 - 39019.9, 2); // what reached euros minus yen put in
  });
  it('adds up to today exactly', () => {
    const sum = b.newMoneyEur + b.stockGainEur + b.dividendsEur + b.interestEur + b.earlierEur + b.otherEur;
    expect(sum).toBeCloseTo(b.todayEur, 2);
    expect(Math.abs(b.otherEur)).toBeLessThan(0.05);
  });
  it('gives the total result and the stock gain on what the funds cost', () => {
    expect(b.resultEur).toBeCloseTo(b.todayEur - b.newMoneyEur, 2);
    expect(b.stockGainPct).toBeCloseTo((4966.14 / 33044.86) * 100, 1);
  });
  it('is all zero for an empty portfolio', () => {
    const e = moneyBreakdown({ ...p, trades: [], deposits: [], dividends: [], cash: [], snapshots: [] }, 0, '2026-10-17');
    expect([e.todayEur, e.newMoneyEur, e.stockGainEur, e.earlierEur, e.otherEur, e.resultEur]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(e.stockGainPct).toBeNull();
  });
});
