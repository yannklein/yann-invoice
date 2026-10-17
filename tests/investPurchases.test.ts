import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, DEFAULT_SYMBOLS } from '@/lib/invest/defaults';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';
import { purchasesByMonth } from '@/lib/invest/purchases';

const rates: Record<string, { JPY: number; USD: number }> = {};
for (let t = Date.parse('2025-03-01T00:00:00Z'); t <= Date.parse('2026-10-20T00:00:00Z'); t += 86_400_000) rates[new Date(t).toISOString().slice(0, 10)] = { JPY: 200, USD: 1.25 };
const empty = { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN };
const jp = buildImport(parseIbkrCsv(readFileSync('tests/fixtures/ibkr-japan.csv', 'utf8')), empty, rates);
const ie = buildImport(parseIbkrCsv(readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8')), { ...empty, trades: jp.trades }, rates);
const trades = [...jp.trades, ...ie.trades];

describe('purchasesByMonth', () => {
  const r = purchasesByMonth(trades, '2026-10-17');
  it('has every month from the first buy to this month, empty ones included', () => {
    expect(r.months[0].month).toBe('2025-04');
    expect(r.months.at(-1)!.month).toBe('2026-10');
    expect(r.months).toHaveLength(19);
    expect(r.months.find((m) => m.month === '2025-06')).toEqual({ month: '2025-06', total: 0 });
  });
  it('sums what each buy cost per fund, transfers left out', () => {
    expect(r.months.find((m) => m.month === '2025-04')).toEqual({ month: '2025-04', IWRD: 3435, IMEU: 1244.5, total: 4679.5 });
    expect(r.months.find((m) => m.month === '2025-09')).toMatchObject({ IWRD: 11375.68, IMEU: 4112.67 });
    expect(r.months.find((m) => m.month === '2026-01')).toEqual({ month: '2026-01', total: 0 }); // the JP→IE transfer month
    expect(r.months.find((m) => m.month === '2026-02')).toMatchObject({ CSBGE3: 7675.02 });
    expect(r.months.find((m) => m.month === '2026-07')).toMatchObject({ IWRD: 5201.99 });
  });
  it('orders funds by how much went into them', () => {
    expect(r.symbols).toEqual(['IWRD', 'CSBGE3', 'IMEU']);
    expect(r.totalEur).toBeCloseTo(33044.86, 2);
  });
  it('is empty without buys', () => expect(purchasesByMonth([], '2026-10-17')).toEqual({ months: [], symbols: [], totalEur: 0 }));
});
