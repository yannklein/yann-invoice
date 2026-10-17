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
    expect(r.deposits.filter((d) => d.kind !== 'fx')).toHaveLength(7);
    expect(r.deposits.filter((d) => d.kind === 'fx')).toHaveLength(1);
    expect(r.dividends).toHaveLength(6);
    expect(r.missingRates).toBe(false);
    expect(r.conversions).toBe(3);
    expect(r.newSymbols).toEqual([]);
  });
  it('counts deposits as money put in, unless dated before internalBefore', () => {
    expect(r.deposits.filter((d) => d.kind !== 'fx').every((d) => d.kind === 'new' && d.source === 'ibkr')).toBe(true);
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

describe('IBKR Japan statement', () => {
  const jp = parseIbkrCsv(readFileSync('tests/fixtures/ibkr-japan.csv', 'utf8'));
  const flat = (from: string, to: string) => {
    const out: Record<string, { JPY: number; USD: number }> = {};
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out[new Date(t).toISOString().slice(0, 10)] = { JPY: 200, USD: 1.25 };
    return out;
  };
  const jr = buildImport(jp, { ...empty, plan: { ...DEFAULT_PLAN, internalBefore: '' } }, flat('2025-03-01', '2026-03-10'));
  it('does not count the currency row as a duplicate', () => {
    expect(jr.duplicates).toEqual({ trades: 0, deposits: 0, dividends: 0 });
  });
  it('converts yen deposits and withdrawals, all new money', () => {
    expect(jr.deposits.filter((d) => d.kind === 'new').map((d) => d.amountEur)).toEqual([2500, 2500, 500, 1800, 10000, 81.74, -81.74, -83.1]);
  });
  it('moves transferred-out shares at what they cost, so the transfer in nets to zero', () => {
    const out = jr.trades.filter((t) => t.source === 'transfer');
    expect(out.map((t) => [t.symbol, t.quantity, t.amountEur])).toEqual([['IMEU', -158.3901, -5357.17], ['IWRD', -198.6907, -14810.68]]);
  });
  it('keeps dividends net of withholding tax', () => {
    expect(jr.dividends.reduce((a, d) => a + d.amountEur, 0)).toBeCloseTo(47.26 + 54.14 - 9.57 - 10.97, 2);
  });
  it('checks positions for this account only', () => {
    const both = buildImport(jp, { ...empty, trades: r.trades, plan: { ...DEFAULT_PLAN, internalBefore: '' } }, flat('2025-03-01', '2026-03-10'));
    expect(both.positionMismatches).toEqual([]);
  });
  it('books the gap to the statement\'s closing cash as currency moves and fees', () => {
    const fx = jr.deposits.filter((d) => d.kind === 'fx');
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ key: 'U0000002|fx|2026-03-05', date: '2026-03-05', source: 'ibkr' });
    // formula cash: 17,216.90 deposits − 20,167.85 buys + 80.86 net dividends; the account really closed with ¥0.73 ≈ €0
    expect(fx[0].amountEur).toBeCloseTo(2870.09, 2);
    const again = buildImport(jp, { ...empty, trades: jr.trades, deposits: jr.deposits, dividends: jr.dividends, plan: { ...DEFAULT_PLAN, internalBefore: '' } }, flat('2025-03-01', '2026-03-10'));
    expect(again.deposits).toEqual([]);
  });
});
