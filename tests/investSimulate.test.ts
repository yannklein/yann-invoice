import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS, SEED_CASH, SEED_DEPOSITS } from '@/lib/invest/defaults';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';
import type { PriceSeries } from '@/lib/invest/prices';
import { flowsOf, simulateBenchmark, weeklyDates, youSeries } from '@/lib/invest/simulate';
import type { Deposit, Portfolio, Trade } from '@/lib/invest/types';

const series = (yahoo: string, pts: [string, number][]): PriceSeries => ({ yahoo, currency: 'EUR', points: pts.map(([date, v]) => ({ date, close: v, adj: v })) });
const A = series('A', [['2026-01-01', 10], ['2026-02-01', 20]]);
const B = series('B', [['2026-01-01', 10]]);
const C = series('C', [['2026-02-01', 10], ['2026-03-01', 20]]);
const dates = ['2026-01-01', '2026-02-01', '2026-03-01'];
const flows = [{ date: '2026-01-01', amountEur: 100 }, { date: '2026-02-01', amountEur: 100 }];
const values = (pts: { value: number }[]) => pts.map((p) => Math.round(p.value * 100) / 100);

describe('simulateBenchmark', () => {
  it('invests every flow in a single leg', () => {
    expect(values(simulateBenchmark([{ yahoo: 'A', weight: 100 }], flows, { A }, dates))).toEqual([100, 300, 300]);
  });
  it('rebalances to the weights on flow dates', () => {
    expect(values(simulateBenchmark([{ yahoo: 'A', weight: 50 }, { yahoo: 'B', weight: 50 }], flows, { A, B }, dates))).toEqual([100, 250, 250]);
  });
  it('holds a leg without prices as cash', () => {
    // 01-01: 50 in A (5 units), 50 cash. 02-01: A=100, cash 50, +100 → 250 → 125 A (6.25u), 125 C (12.5u). 03-01: 125 + 250.
    expect(values(simulateBenchmark([{ yahoo: 'A', weight: 50 }, { yahoo: 'C', weight: 50 }], flows, { A, C }, dates))).toEqual([100, 250, 375]);
  });
  it('drops dates before the first flow', () => {
    expect(simulateBenchmark([{ yahoo: 'A', weight: 1 }], [flows[1]], { A }, dates).map((p) => p.date)).toEqual(['2026-02-01', '2026-03-01']);
  });
});

const portfolio = (over: Partial<Portfolio> = {}): Portfolio => ({
  trades: [], deposits: [], dividends: [], cash: [], snapshots: [], plan: DEFAULT_PLAN,
  slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: [], invalidRows: 0, ...over,
});

describe('no flows gives empty series', () => {
  it('has no points and no NaN', () => {
    expect(simulateBenchmark([{ yahoo: 'A', weight: 1 }], [], { A }, dates)).toEqual([]);
    expect(youSeries(portfolio(), {}, dates).points).toEqual([]);
  });
});

describe('flowsOf', () => {
  it('keeps only new money', () => {
    const stmt = parseIbkrCsv(readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8'));
    const imported = buildImport(stmt, { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN }, {});
    const f = flowsOf({ deposits: [...SEED_DEPOSITS, ...imported.deposits], cash: SEED_CASH });
    expect(f.map((x) => x.date)).toEqual(SEED_DEPOSITS.map((d) => d.date));
    expect(f.reduce((s, x) => s + x.amountEur, 0)).toBeCloseTo(39019.9, 2);
  });
  it('merges same-day deposits and adds Livret Bleu deposits', () => {
    const d = (amountEur: number): Deposit => ({ ...SEED_DEPOSITS[0], key: String(amountEur), amountEur });
    const f = flowsOf({ deposits: [d(10), d(20)], cash: [{ date: '2023-01-01', deposit: 50, balance: 50, note: '' }] });
    expect(f).toEqual([{ date: '2022-12-01', amountEur: 30 }, { date: '2023-01-01', amountEur: 50 }]);
  });
});

describe('weeklyDates', () => {
  it('steps a week and ends on the last date', () => {
    expect(weeklyDates('2026-01-01', '2026-01-20')).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-20']);
  });
});

describe('youSeries', () => {
  const trade: Trade = { key: 'x', date: '2026-02-01', account: 'U1', symbol: 'X', isin: '', currency: 'EUR', quantity: 10, price: 4, commission: 0, amountEur: 40, source: 'transfer', note: '' };
  const cashDeposit: Deposit = { key: 'c', date: '2026-02-01', currency: 'EUR', amount: 3, amountEur: 3, source: 'ibkr', kind: 'internal', note: '' };
  const p = portfolio({
    trades: [trade], deposits: [cashDeposit],
    snapshots: [{ date: '2026-01-01', valueEur: 100, note: '' }, { date: '2026-01-15', valueEur: 200, note: '' }],
    plan: { ...DEFAULT_PLAN, exactFrom: '2026-02-01' },
  });
  const X = series('X.AS', [['2026-01-01', 5]]);
  it('interpolates snapshots before exactFrom and values holdings after', () => {
    const pts = youSeries(p, { X }, ['2025-12-01', '2026-01-08', '2026-01-22', '2026-02-01', '2026-03-01']).points;
    expect(pts.map((x) => x.date)).toEqual(['2026-01-08', '2026-01-22', '2026-02-01', '2026-03-01']);
    expect(pts[0]).toEqual({ date: '2026-01-08', value: 150, approx: true });
    expect(pts[1].value).toBeCloseTo(200 + (53 - 200) * (7 / 17), 2);
    expect(pts[1].approx).toBe(true);
    expect(pts[2]).toEqual({ date: '2026-02-01', value: 53, approx: false });
  });
  it('falls back to the last trade price without a series', () => {
    expect(youSeries(p, { X: null }, ['2026-03-01']).points[0].value).toBe(43);
  });
});
