import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, DEFAULT_SYMBOLS } from '@/lib/invest/defaults';
import { nextBuyDate, rebalance } from '@/lib/invest/holdings';
import { parseIbkrCsv, splitCsvLine } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';
import { buffettHorizon, project } from '@/lib/invest/projection';
import { fromRow, planFromRows } from '@/lib/invest/rows';
import type { Deposit } from '@/lib/invest/types';
import { wrapNote } from '@/lib/invoice/writePlan';

const stmt = parseIbkrCsv(readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8'));
const rates = { '2026-03-31': { USD: 1.14 }, '2026-06-30': { USD: 1.14 }, '2026-09-30': { USD: 1.14 } };
const empty = { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN };

describe('importing a statement after a later one', () => {
  it('books the same currency correction whatever was imported after the statement end', () => {
    const alone = buildImport(stmt, empty, rates).deposits.find((d) => d.kind === 'fx')!;
    const later: Deposit = {
      key: `${stmt.account}|dep|2026-12-01|EUR|5000|0`, date: '2026-12-01', currency: 'EUR', amount: 5000, amountEur: 5000, source: 'ibkr', kind: 'new', note: '',
    };
    const r = buildImport(stmt, { ...empty, deposits: [later] }, rates);
    expect(r.deposits.find((d) => d.kind === 'fx')?.amountEur).toBeCloseTo(alone.amountEur, 2);
  });
});

describe('parseIbkrCsv: hostile input', () => {
  it('returns an empty statement for an empty or unrelated file', () => {
    for (const text of ['', 'a,b,c\n1,2,3', '\n\n']) {
      const s = parseIbkrCsv(text);
      expect(s.account).toBe('');
      expect(s.trades).toEqual([]);
    }
  });
  it('reports a malformed trade row instead of importing it', () => {
    const bad = parseIbkrCsv(
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee\n' +
        'Trades,Data,Order,Stocks,EUR,IWRD,"2026-01-02, 10:00:00",abc,1,1,1',
    );
    expect(bad.trades).toEqual([]);
    expect(bad.skipped).toHaveLength(1);
  });
  it('splits quoted fields holding commas and escaped quotes', () => {
    expect(splitCsvLine('a,"b, c","say ""hi""",')).toEqual(['a', 'b, c', 'say "hi"', '']);
  });
});

describe('rows: sheet cells typed by hand', () => {
  it('reads a Sheets date serial as an ISO date', () => {
    expect(fromRow.cash([46023, 0, 100, ''])?.date).toBe('2026-01-01');
  });
  it('rejects a trade with an unknown source or currency', () => {
    expect(fromRow.trades(['k', '2026-01-01', 'U1', 'X', '', 'EUR', 1, 1, 0, 1, 'gift', ''])).toBeNull();
    expect(fromRow.trades(['k', '2026-01-01', 'U1', 'X', '', 'GBP', 1, 1, 0, 1, 'ibkr', ''])).toBeNull();
  });
  it('falls back to default buy months when the cell is 1.7 (comma-decimal sheet)', () => {
    expect(planFromRows([['buyMonths', 1.7]]).buyMonths).toEqual(DEFAULT_PLAN.buyMonths);
  });
});

describe('planning maths at the edges', () => {
  it('rolls the next buy over the year end', () => {
    expect(nextBuyDate('2026-12-02', [1, 7])).toEqual({ date: '2027-01-01', days: 30 });
    expect(nextBuyDate('2026-07-01', [1, 7])).toEqual({ date: '2026-07-01', days: 0 });
    expect(nextBuyDate('2026-07-01', [])).toBeNull();
  });
  it('buys nothing for a zero, negative or NaN amount', () => {
    const slots = [{ slot: 'A', kind: 'stocks' as const, weight: 1, valueEur: 0 }];
    for (const a of [0, -10, NaN]) expect(rebalance(slots, a)).toEqual([{ slot: 'A', buyEur: 0 }]);
  });
  it('spreads the buy by weight when every slot is empty, and never buys negative amounts', () => {
    const slots = [
      { slot: 'A', kind: 'stocks' as const, weight: 0.8, valueEur: 0 },
      { slot: 'B', kind: 'bonds' as const, weight: 0.2, valueEur: 10_000 },
    ];
    const buys = rebalance(slots, 1000);
    expect(buys.every((b) => b.buyEur >= 0)).toBe(true);
    expect(buys.reduce((s, b) => s + b.buyEur, 0)).toBeCloseTo(1000, 2);
  });
  it('projects with zero and negative real returns', () => {
    expect(project({ startEur: 1000, perBuyEur: 100, buysPerYear: 2, realReturn: 0 }, [10])[0].valueEur).toBe(3000);
    expect(project({ startEur: 1000, perBuyEur: 0, buysPerYear: 1, realReturn: -0.5 }, [1])[0].valueEur).toBe(500);
  });
  it('has no Buffett horizon once past 96', () => {
    expect(buffettHorizon(1900, '2026-01-01')).toBeNull();
    expect(buffettHorizon(1990, '2026-01-01')).toBe(60);
  });
});

describe('wrapNote at the edges', () => {
  it('handles empty and whitespace-only notes', () => {
    expect(wrapNote('')).toEqual([]);
    expect(wrapNote('   ')).toEqual([]);
  });
  it('never emits a line wider than the width', () => {
    const lines = wrapNote(`- ${'word '.repeat(60)}${'x'.repeat(250)}`, 40);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
  });
});
