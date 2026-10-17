import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, DEFAULT_SYMBOLS } from '@/lib/invest/defaults';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport } from '@/lib/invest/importPlan';

const csv = readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8');
const stmt = parseIbkrCsv(csv);
const rates = { '2026-03-31': { USD: 1.14 }, '2026-06-30': { USD: 1.14 }, '2026-09-30': { USD: 1.14 } };
const empty = { trades: [], deposits: [], dividends: [], symbols: DEFAULT_SYMBOLS, plan: DEFAULT_PLAN };
const r = buildImport(stmt, empty, rates);

describe('buildImport on the 2026 YTD statement', () => {
  it('turns the statement into new rows', () => {
    expect(r.trades.filter((t) => t.source === 'ibkr')).toHaveLength(2);
    expect(r.trades.filter((t) => t.source === 'transfer')).toHaveLength(2);
    expect(r.deposits).toHaveLength(7);
    expect(r.dividends).toHaveLength(6);
    expect(r.missingRates).toBe(false);
    expect(r.conversions).toBe(3);
    expect(r.newSymbols).toEqual([]);
  });
  it('marks deposits before internalBefore as internal moves', () => {
    expect(r.deposits.every((d) => d.kind === 'internal' && d.source === 'ibkr')).toBe(true);
    const later = buildImport(stmt, { ...empty, plan: { ...DEFAULT_PLAN, internalBefore: '2026-06-01' } }, rates);
    expect(later.deposits.filter((d) => d.kind === 'new').map((d) => d.date)).toEqual(['2026-06-30', '2026-06-30', '2026-06-30']);
  });
  it('freezes EUR amounts with commissions', () => {
    expect(r.trades.find((t) => t.symbol === 'CSBGE3')).toMatchObject({ amountEur: 7675.02, source: 'ibkr', isin: 'IE00B3VTMJ91', quantity: 66 });
    expect(r.trades.find((t) => t.symbol === 'IWRD' && t.source === 'ibkr')!.amountEur).toBe(5201.99);
    expect(r.trades.find((t) => t.symbol === 'IMEU')).toMatchObject({ amountEur: 5357.17, source: 'transfer', commission: 0, date: '2026-01-27' });
  });
  it('converts USD dividends at the day rate', () => {
    expect(r.dividends.filter((d) => d.currency === 'USD').map((d) => d.amountEur)).toEqual([22.83, 74.49, 34.67]);
  });
  it('reconciles positions and cash with the statement', () => {
    expect(r.positionMismatches).toEqual([]);
    expect(Math.abs(r.cashDiffEur!)).toBeLessThan(5);
  });
});

describe('dedupe', () => {
  it('dedupes a second import', () => {
    const again = buildImport(stmt, { ...empty, trades: r.trades, deposits: r.deposits, dividends: r.dividends }, rates);
    expect([again.trades.length, again.deposits.length, again.dividends.length]).toEqual([0, 0, 0]);
    expect(again.duplicates).toEqual({ trades: 4, deposits: 7, dividends: 6 });
    expect(again.positionMismatches).toEqual([]);
  });
  it('keeps identical same-day deposits apart', () => {
    const twice = csv.replace(
      'Deposits & Withdrawals,Data,EUR,2026-06-30,Electronic Fund Transfer,2700',
      'Deposits & Withdrawals,Data,EUR,2026-06-30,Electronic Fund Transfer,300',
    );
    const d = buildImport(parseIbkrCsv(twice), empty, rates).deposits.filter((x) => x.date === '2026-06-30' && x.amount === 300);
    expect(d).toHaveLength(2);
    expect(d[0].key).not.toBe(d[1].key);
  });
});

describe('problems are reported, not hidden', () => {
  it('flags missing rates but still converts EUR rows', () => {
    const n = buildImport(stmt, empty, null);
    expect(n.missingRates).toBe(true);
    expect(n.trades).toHaveLength(4);
  });
  it('reports a position that differs from the statement', () => {
    const extra = { ...r.trades[0], key: 'manual-1', symbol: 'IWRD', quantity: 1, source: 'manual' as const };
    const m = buildImport(stmt, { ...empty, trades: [extra] }, rates);
    expect(m.positionMismatches).toEqual([{ symbol: 'IWRD', sheet: 257.1369, statement: 256.1369 }]);
  });
  it('lists instruments missing from Symbols, with a Yahoo symbol only when known', () => {
    const m = buildImport(stmt, { ...empty, symbols: DEFAULT_SYMBOLS.filter((s) => s.symbol !== 'IMEU') }, rates);
    expect(m.newSymbols).toEqual([{ symbol: 'IMEU', isin: 'IE00B1YZSC51', yahoo: 'IMEU.AS', name: 'iShares Core MSCI Europe (Dist)', terPct: 0.12, sri: false }]);
  });
});

describe('dividend dedupe', () => {
  const div = (amount: number) => `Dividends,Data,EUR,2026-02-27,IMEU(IE00B1YZSC51) Cash Dividend EUR 0.0967 per Share (Mixed Income),${amount}`;
  it('keeps two components of the same payment day apart', () => {
    const split = csv.replace(div(15.32), `${div(10)}\n${div(5.32)}`);
    const d = buildImport(parseIbkrCsv(split), empty, rates).dividends.filter((x) => x.date === '2026-02-27');
    expect(d.map((x) => x.amount)).toEqual([10, 5.32]);
    expect(d[0].key).not.toBe(d[1].key);
  });
  it('adds a component missing from an earlier upload', () => {
    const first = buildImport(parseIbkrCsv(csv), empty, rates);
    const later = csv.replace(div(15.32), `${div(15.32)}\n${div(-2)}`);
    const again = buildImport(parseIbkrCsv(later), { ...empty, dividends: first.dividends }, rates);
    expect(again.dividends.map((x) => x.amount)).toEqual([-2]);
  });
  it('recognises rows imported with the old key format', () => {
    const old = r.dividends.map((d) => ({ ...d, key: `U0000001|div|${d.date}|${d.symbol}|${d.currency}` }));
    expect(buildImport(stmt, { ...empty, dividends: old }, rates).dividends).toEqual([]);
  });
});

describe('transfers keep their original cost', () => {
  const xfer = (symbol: string) => r.trades.find((t) => t.source === 'transfer' && t.symbol === symbol)!;
  it('carries the cost basis from the old account instead of the value on the day', () => {
    expect(xfer('IMEU')).toMatchObject({ amountEur: 5357.17, quantity: 158.3901 });
    expect(xfer('IMEU').price).toBeCloseTo(33.822621, 5);
    expect(xfer('IMEU').note).toContain('€5,988.73');
    expect(xfer('IWRD').amountEur).toBe(14810.68); // 20,012.67 total cost − the 5,201.99 July buy
  });
  it('falls back to the value on the day without Open Positions', () => {
    const noPositions = csv.split('\n').filter((l) => !l.startsWith('Open Positions')).join('\n');
    const t = buildImport(parseIbkrCsv(noPositions), empty, rates).trades.find((x) => x.source === 'transfer' && x.symbol === 'IMEU')!;
    expect(t.amountEur).toBe(5988.73);
  });
  it('corrects rows imported before with the value on the day', () => {
    const old = r.trades.map((t) => (t.source === 'transfer' ? { ...t, amountEur: t.symbol === 'IMEU' ? 5988.73 : 16144.41, note: '' } : t));
    const again = buildImport(stmt, { ...empty, trades: old, deposits: r.deposits, dividends: r.dividends }, rates);
    expect(again.trades).toEqual([]);
    expect(again.corrections.map((t) => [t.symbol, t.amountEur])).toEqual([['IMEU', 5357.17], ['IWRD', 14810.68]]);
    expect(buildImport(stmt, { ...empty, trades: r.trades, deposits: r.deposits, dividends: r.dividends }, rates).corrections).toEqual([]);
  });
});
