import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, SEED_CASH, SEED_DEPOSITS, SEED_SNAPSHOTS, defaultRowsFor } from '@/lib/invest/defaults';
import { APP_TABS, HEADERS, fromRow, invalidPlanKeys, parsePortfolio, planFromRows, planToRows, toRow, type AppTab } from '@/lib/invest/rows';
import type { CashRow, Deposit, Dividend, Snapshot, Trade } from '@/lib/invest/types';

const trade: Trade = {
  key: 'U1|2026-02-04 10:54:45|CSBGE3|66', date: '2026-02-04', account: 'U1', symbol: 'CSBGE3', isin: 'IE00B3VTMJ91',
  currency: 'EUR', quantity: 66, price: 116.23, commission: 3.83559, amountEur: 7675.02, source: 'ibkr', note: '',
};
const emptyRaw = (): Record<AppTab, unknown[][]> => Object.fromEntries(APP_TABS.map((t) => [t, []])) as unknown as Record<AppTab, unknown[][]>;

describe('row round-trips', () => {
  it('trades', () => expect(fromRow.trades(toRow.trades(trade))).toEqual(trade));
  it('deposits', () => {
    const d: Deposit = { key: 'k', date: '2026-06-30', currency: 'EUR', amount: 300, amountEur: 300, source: 'ibkr', kind: 'internal', note: '' };
    expect(fromRow.deposits(toRow.deposits(d))).toEqual(d);
  });
  it('dividends, cash and snapshots', () => {
    const v: Dividend = { key: 'k', date: '2026-03-31', symbol: 'IWRD', currency: 'USD', amount: 26.03, amountEur: 22.83 };
    const c: CashRow = { date: '2026-07-05', deposit: 0, balance: 4559.7, note: 'x' };
    const s: Snapshot = { date: '2025-01-01', valueEur: 33592.74, note: 'y' };
    expect(fromRow.dividends(toRow.dividends(v))).toEqual(v);
    expect(fromRow.cash(toRow.cash(c))).toEqual(c);
    expect(fromRow.snapshots(toRow.snapshots(s))).toEqual(s);
  });
  it('slots keep symbol lists and turn a blank SRI symbol into null', () => {
    const world = { ...DEFAULT_SLOTS[0], holdSymbols: ['IWRD', '2B7K'] };
    expect(fromRow.slots(toRow.slots(world))).toEqual(world);
    expect(fromRow.slots(toRow.slots(DEFAULT_SLOTS[2]))!.sriSymbol).toBeNull();
  });
  it('symbols and benchmarks', () => {
    const sym = { symbol: '2B7K', isin: 'IE00BYX2JD69', yahoo: '2B7K.DE', name: 'iShares MSCI World SRI', terPct: 0.2, sri: true };
    expect(fromRow.symbols(toRow.symbols(sym))).toEqual(sym);
    expect(fromRow.benchmarks(toRow.benchmarks(DEFAULT_BENCHMARKS[0]))).toEqual(DEFAULT_BENCHMARKS[0]);
  });
  it('plan', () => expect(planFromRows(planToRows(DEFAULT_PLAN))).toEqual(DEFAULT_PLAN));
});

describe('rejects malformed rows', () => {
  it('rejects a blank quantity, an impossible date and an unknown currency', () => {
    expect(fromRow.trades(toRow.trades({ ...trade }).map((c, i) => (i === 6 ? '' : c)))).toBeNull();
    expect(fromRow.trades(toRow.trades({ ...trade, date: '2026-13-01' }))).toBeNull();
    expect(fromRow.trades(toRow.trades(trade).map((c, i) => (i === 5 ? 'GBP' : c)))).toBeNull();
  });
  it('counts unparseable rows in invalidRows and skips blank ones', () => {
    const raw = emptyRaw();
    raw.Trades = [toRow.trades(trade), toRow.trades({ ...trade, date: 'nope' }), ['', '']];
    const p = parsePortfolio(raw);
    expect(p.trades).toHaveLength(1);
    expect(p.invalidRows).toBe(1);
  });
});

describe('planFromRows', () => {
  it('falls back to defaults for missing keys', () => {
    const p = planFromRows([['perBuyEur', 7000]]);
    expect(p.perBuyEur).toBe(7000);
    expect(p.buyMonths).toEqual([1, 7]);
  });
});

describe('defaults', () => {
  it('benchmark weights sum to 100 per benchmark', () => {
    const sums = new Map<string, number>();
    for (const l of DEFAULT_BENCHMARKS) sums.set(l.benchmark, (sums.get(l.benchmark) ?? 0) + l.weight);
    expect(sums.size).toBe(7);
    for (const v of sums.values()) expect(v).toBeCloseTo(100, 6);
  });
  it('seed deposits are the new money only', () => {
    expect(SEED_DEPOSITS.map((d) => d.amountEur)).toEqual([8422.23, 7635.53, 7676.07, 3116.04, 3120.51, 3123.24, 3112.36, 615.04, 2198.88]);
    expect(SEED_DEPOSITS.every((d) => d.kind === 'new' && d.source === 'sheet')).toBe(true);
    expect(SEED_DEPOSITS.reduce((s, d) => s + d.amountEur, 0)).toBeCloseTo(39019.9, 2);
  });
  it('seed snapshots, cash and plan', () => {
    expect(SEED_SNAPSHOTS.map((s) => s.valueEur)).toEqual([8422.23, 15888.33, 23228.73, 33946.65]);
    expect(SEED_CASH[0]).toMatchObject({ date: '2026-07-05', deposit: 0, balance: 4559.7 });
    expect(DEFAULT_PLAN).toMatchObject({ internalBefore: '2026-07-06', exactFrom: '2026-07-05' });
  });
});

describe('defaultRowsFor only seeds missing tabs', () => {
  it('gives data rows matching each header width', () => {
    expect(defaultRowsFor('Trades')).toEqual([]);
    const deps = defaultRowsFor('Deposits');
    expect(deps).toHaveLength(9);
    expect(deps.every((r) => r[HEADERS.Deposits.indexOf('source')] === 'sheet')).toBe(true);
    expect(defaultRowsFor('Slots')).toHaveLength(3);
    for (const t of APP_TABS) for (const r of defaultRowsFor(t)) expect(r).toHaveLength(HEADERS[t].length);
  });
});

describe('hand-typed dates', () => {
  it('accepts a Sheets date serial where a date is expected', () => {
    // 46057 = 2026-02-04 in Sheets' 1899-12-30 epoch
    expect(fromRow.trades(toRow.trades(trade).map((c, i) => (i === 1 ? 46057 : c)))!.date).toBe('2026-02-04');
    expect(fromRow.cash([46208, 0, 4559.7, ''])!.date).toBe('2026-07-05');
  });
});

describe('plan dates typed by hand', () => {
  it('reads a serial for date keys but never for amounts', () => {
    const p = planFromRows([['exactFrom', 46300], ['perBuyEur', 25000]]);
    expect(p.exactFrom).toBe('2026-10-05');
    expect(p.perBuyEur).toBe(25000);
  });
});

describe('plan values that do not parse are reported', () => {
  it('flags a buyMonths cell Sheets turned into a decimal number', () => {
    const raw = emptyRaw();
    raw.Plan = [['buyMonths', 1.7], ['perBuyEur', 'lots'], ['realReturnStocks', 0.05]];
    expect(invalidPlanKeys(raw.Plan)).toEqual(['buyMonths', 'perBuyEur']);
    expect(parsePortfolio(raw).invalidRows).toBe(2);
  });
  it('accepts ; or spaces between months', () => {
    expect(planFromRows([['buyMonths', '1;7']]).buyMonths).toEqual([1, 7]);
    expect(planFromRows([['buyMonths', '3 9']]).buyMonths).toEqual([3, 9]);
    expect(invalidPlanKeys([['buyMonths', '1;7'], ['birthYear', '']])).toEqual([]);
  });
});
