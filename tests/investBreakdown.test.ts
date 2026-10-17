import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closedHistory, moneyBreakdown } from '@/lib/invest/breakdown';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS, SEED_CASH, SEED_DEPOSITS } from '@/lib/invest/defaults';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';
import type { Portfolio } from '@/lib/invest/types';

// The whole history: Rakuten closed, IBKR Japan (2025) then IBKR Ireland (2026), €700 taken out of the Livret Bleu.
// Flat test rates: ¥200 and $1.25 per euro.
const rates: Record<string, { JPY: number; USD: number }> = {};
for (let t = Date.parse('2025-03-01T00:00:00Z'); t <= Date.parse('2026-10-20T00:00:00Z'); t += 86_400_000) rates[new Date(t).toISOString().slice(0, 10)] = { JPY: 200, USD: 1.25 };
const empty = { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN };
const jp = buildImport(parseIbkrCsv(readFileSync('tests/fixtures/ibkr-japan.csv', 'utf8')), empty, rates);
const ie = buildImport(parseIbkrCsv(readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8')), { ...empty, trades: jp.trades }, rates);
const p: Portfolio = {
  trades: [...jp.trades, ...ie.trades], deposits: [...SEED_DEPOSITS, ...jp.deposits, ...ie.deposits], dividends: [...jp.dividends, ...ie.dividends],
  cash: [...SEED_CASH, { date: '2026-10-17', deposit: 0, balance: 3859.7, note: '' }], snapshots: [],
  plan: DEFAULT_PLAN, slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: DEFAULT_BENCHMARKS, invalidRows: 0,
};
const FUNDS = 38011; // the three funds at the latest prices

describe('moneyBreakdown (restart at IBKR)', () => {
  const b = moneyBreakdown(p, FUNDS, '2026-10-17');
  it('counts IBKR and Livret Bleu deposits as money put in, never Rakuten', () => {
    expect(b.newMoneyEur).toBeCloseTo(17216.9 + 12700 + 4559.7 - 700, 2);
    expect(b.firstFlowDate).toBe('2025-03-06');
  });
  it('splits the result into stock gain, dividends after tax, and currency moves with fees', () => {
    expect(b.stockGainEur).toBeCloseTo(38011 - 33044.86, 2);
    expect(b.dividendsEur).toBeCloseTo(80.86 + 135.88 + 120.38, 2);
    expect(b.currencyEur).toBeCloseTo(2870.09 + 11.96, 2); // flat test rates make the yen look cheap; real rates give a loss
    expect(b.earlierEur).toBe(0);
  });
  it('adds up to today exactly, with cash matching the statements', () => {
    expect(b.todayEur).toBeCloseTo(38011 + 91.21 + 3859.7, 2);
    const sum = b.newMoneyEur + b.stockGainEur + b.dividendsEur + b.interestEur + b.currencyEur + b.earlierEur + b.otherEur;
    expect(sum).toBeCloseTo(b.todayEur, 2);
    expect(Math.abs(b.otherEur)).toBeLessThan(0.05);
  });
  it('is all zero for an empty portfolio', () => {
    const e = moneyBreakdown({ ...p, trades: [], deposits: [], dividends: [], cash: [] }, 0, '2026-10-17');
    expect([e.todayEur, e.newMoneyEur, e.stockGainEur, e.currencyEur, e.earlierEur, e.otherEur, e.resultEur]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(e.stockGainPct).toBeNull();
    expect(e.firstFlowDate).toBeNull();
  });
});

describe('closedHistory', () => {
  it('sums what went into Rakuten and shows no result until a payout is recorded', () => {
    expect(closedHistory(p)).toEqual({ putInJpy: 4600000, putInEur: 29970.38, from: '2022-12-01', to: '2025-01-19', payoutEur: null, resultEur: null });
  });
  it('gives a result once the payout row exists', () => {
    const payout = { ...SEED_DEPOSITS[0], key: 'payout', date: '2025-06-01', amount: -5300000, amountEur: -32000 };
    expect(closedHistory({ ...p, deposits: [...p.deposits, payout] })).toMatchObject({ payoutEur: 32000, resultEur: 2029.62 });
  });
  it('is null without closed rows', () => expect(closedHistory({ ...p, deposits: [] })).toBeNull());
});

describe('today split by account', () => {
  it('shows the IBKR account apart from the Livret Bleu', () => {
    const b = moneyBreakdown(p, FUNDS, '2026-10-17');
    expect(b.fundsEur).toBe(38011);
    expect(b.ibkrCashEur).toBeCloseTo(91.21, 2);
    expect(b.ibkrEur).toBeCloseTo(38011 + 91.21, 2);
    expect(b.livretEur).toBe(3859.7);
    expect(b.ibkrEur + b.livretEur).toBeCloseTo(b.todayEur, 2);
  });
});
