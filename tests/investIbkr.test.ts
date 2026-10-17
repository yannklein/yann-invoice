import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIbkrCsv, splitCsvLine } from '@/lib/invest/ibkr';

const csv = readFileSync('tests/fixtures/ibkr-activity.csv', 'utf8');
const s = parseIbkrCsv(csv);

describe('parseIbkrCsv on the 2026 YTD statement', () => {
  it('reads the account and period', () => {
    expect(s.account).toBe('U0000001');
    expect(s.period).toEqual({ from: '2026-01-01', to: '2026-10-15' });
  });
  it('reads the two stock trades', () => {
    expect(s.trades).toHaveLength(2);
    expect(s.trades[0]).toMatchObject({ date: '2026-02-04', dateTime: '2026-02-04 10:54:45', symbol: 'CSBGE3', currency: 'EUR', quantity: 66, price: 116.23, proceeds: -7671.18, commission: 3.83559 });
    expect(s.trades[1]).toMatchObject({ date: '2026-07-06', symbol: 'IWRD', quantity: 57.4462, proceeds: -5198.9911, commission: 3 });
  });
  it('counts forex conversions (second Trades header) without importing them', () => {
    expect(s.conversions).toBe(3);
    expect(s.trades.some((t) => t.symbol === 'EUR.USD')).toBe(false);
  });
  it('reads position transfers with thousands separators', () => {
    expect(s.transfers).toEqual([
      { date: '2026-01-27', symbol: 'IMEU', currency: 'EUR', quantity: 158.3901, marketValue: 5988.73, counterparty: 'U0000002' },
      { date: '2026-01-27', symbol: 'IWRD', currency: 'EUR', quantity: 198.6907, marketValue: 16144.41, counterparty: 'U0000002' },
    ]);
  });
  it('reads deposits', () => {
    expect(s.deposits).toHaveLength(7);
    expect(s.deposits.reduce((a, d) => a + d.amount, 0)).toBe(12700);
    expect(s.deposits.filter((d) => d.date === '2026-06-30')).toHaveLength(3);
  });
  it('reads dividends without the total rows', () => {
    expect(s.dividends).toHaveLength(6);
    expect(s.dividends[0]).toEqual({ date: '2026-02-27', symbol: 'IMEU', isin: 'IE00B1YZSC51', currency: 'EUR', amount: 15.32 });
    expect(s.dividends[3]).toMatchObject({ symbol: 'IWRD', currency: 'USD', amount: 26.03 });
  });
  it('reads ending positions, cash and instruments', () => {
    expect(s.endingPositions).toEqual({ CSBGE3: 66, IMEU: 158.3901, IWRD: 256.1369 });
    expect(s.endingCostBasis).toEqual({ CSBGE3: 7675.01559, IMEU: 5357.168398, IWRD: 20012.672334 });
    expect(s.endingCashEur).toBeCloseTo(91.2073, 4);
    expect(s.instruments.CSBGE3).toMatchObject({ isin: 'IE00B3VTMJ91', exchange: 'EBS' });
    expect(s.skipped).toEqual([]);
  });
});

describe('splitCsvLine', () => {
  it('handles quotes, embedded commas, empty fields and escaped quotes', () => {
    expect(splitCsvLine('a,"b, c",,"x ""y"""')).toEqual(['a', 'b, c', '', 'x "y"']);
  });
});

describe('bad input', () => {
  it('lists a corrupt data row in skipped', () => {
    const bad = csv.replace('"2026-02-04, 10:54:45",66,', '"2026-02-04, 10:54:45",abc,');
    const r = parseIbkrCsv(bad);
    expect(r.trades).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toContain('CSBGE3');
  });
  it('returns an empty statement for empty input', () => {
    expect(parseIbkrCsv('')).toMatchObject({ account: '', period: null, trades: [], deposits: [], dividends: [], transfers: [], conversions: 0, endingCashEur: null, skipped: [] });
  });
});

describe('parseIbkrCsv on the IBKR Japan statement', () => {
  const jp = parseIbkrCsv(readFileSync('tests/fixtures/ibkr-japan.csv', 'utf8'));
  it('reads the base currency and the closing cash in it', () => {
    expect(jp.baseCurrency).toBe('JPY');
    expect(jp.endingCashBase).toBeCloseTo(0.732175, 5);
    expect(s.baseCurrency).toBe('EUR');
    expect(s.endingCashBase).toBeCloseTo(91.207325, 5);
  });
  it('reads buys, transfers out and deposits with withdrawals', () => {
    expect(jp.trades.map((t) => [t.symbol, t.quantity])).toEqual([['IMEU', 39.3901], ['IMEU', 119], ['IWRD', 52.9514], ['IWRD', 145.7393]]);
    expect(jp.transfers[0]).toEqual({ date: '2026-01-27', symbol: 'IMEU', currency: 'EUR', quantity: -158.3901, marketValue: -5988.73, counterparty: 'U0000001' });
    expect(jp.deposits).toHaveLength(8);
    expect(jp.deposits.reduce((a, d) => a + d.amount, 0)).toBe(3443380);
    expect(jp.conversions).toBe(6);
    expect(jp.skipped).toEqual([]);
  });
  it('reads withholding tax as negative amounts per dividend', () => {
    expect(jp.withholding).toHaveLength(12);
    expect(jp.withholding[0]).toEqual({ date: '2025-05-30', symbol: 'IMEU', isin: 'IE00B1YZSC51', currency: 'EUR', amount: -0.73 });
    expect(jp.withholding.filter((w) => w.currency === 'USD').reduce((a, w) => a + w.amount, 0)).toBeCloseTo(-13.72, 2);
  });
});
