import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOTS } from '@/lib/invest/defaults';
import { holdings, ibkrCashEur, livretOn, nextBuyDate, rebalance, slotValues, type SlotValue } from '@/lib/invest/holdings';
import type { Deposit, Dividend, Trade } from '@/lib/invest/types';

const t = (date: string, symbol: string, quantity: number, amountEur: number, source: Trade['source'] = 'ibkr'): Trade => ({
  key: `${date}|${symbol}|${quantity}`, date, account: 'U1', symbol, isin: '', currency: 'EUR', quantity,
  price: amountEur / quantity, commission: 0, amountEur, source, note: '',
});
const trades = [
  t('2026-01-27', 'IMEU', 158.3901, 5988.73, 'transfer'),
  t('2026-01-27', 'IWRD', 198.6907, 16144.41, 'transfer'),
  t('2026-02-04', 'CSBGE3', 66, 7675.02),
  t('2026-07-06', 'IWRD', 57.4462, 5201.99),
];
const dep = (date: string, amountEur: number, source: Deposit['source'] = 'ibkr'): Deposit => ({
  key: `${date}|${amountEur}`, date, currency: 'EUR', amount: amountEur, amountEur, source, kind: 'internal', note: '',
});
const div = (date: string, amountEur: number): Dividend => ({ key: date, date, symbol: 'IMEU', currency: 'EUR', amount: amountEur, amountEur });

describe('holdings', () => {
  it('nets quantities per symbol', () => expect(holdings(trades)).toEqual({ CSBGE3: 66, IMEU: 158.3901, IWRD: 256.1369 }));
  it('stops at a date', () => expect(holdings(trades, '2026-03-01').IWRD).toBe(198.6907));
  it('drops closed positions', () => expect(holdings([...trades, t('2026-08-01', 'CSBGE3', -66, -7700)])).not.toHaveProperty('CSBGE3'));
});

describe('ibkrCashEur', () => {
  it('counts IBKR deposits, IBKR trades and dividends only', () => {
    const p = {
      trades,
      deposits: [dep('2026-01-07', 7700), dep('2026-06-30', 5000), dep('2025-07-01', 4445.76, 'sheet')],
      dividends: [div('2026-02-27', 135.88), div('2026-09-30', 131.99)],
    };
    expect(ibkrCashEur(p)).toBeCloseTo(90.86, 2);
    expect(ibkrCashEur(p, '2026-02-04')).toBeCloseTo(7700 - 7675.02, 2);
  });
});

describe('livretOn', () => {
  const cash = [{ date: '2026-07-05', deposit: 0, balance: 4559.7, note: '' }, { date: '2027-01-01', deposit: 0, balance: 4620, note: '' }];
  it('uses the latest balance on or before the date', () => {
    expect(livretOn(cash, '2026-07-04')).toBe(0);
    expect(livretOn(cash, '2026-10-17')).toBe(4559.7);
    expect(livretOn(cash, '2027-02-01')).toBe(4620);
  });
});

describe('slotValues', () => {
  it('adds the Livret Bleu to its slot and lists unassigned symbols', () => {
    const r = slotValues(DEFAULT_SLOTS, { IWRD: 24005.15, IMEU: 6322.93, CSBGE3: 7675.14, XYZ: 10 }, 4559.7);
    expect(r.slots.map((s) => s.valueEur)).toEqual([24005.15, 6322.93, 12234.84]);
    expect(r.slots.map((s) => s.weight)).toEqual([0.55, 0.2, 0.25]);
    expect(r.unassigned).toEqual(['XYZ']);
  });
});

const sv = (values: number[], weights: number[]): SlotValue[] =>
  values.map((valueEur, i) => ({ slot: `S${i}`, kind: 'stocks', weight: weights[i], valueEur }));
const buys = (values: number[], weights: number[], amount: number) => rebalance(sv(values, weights), amount).map((b) => b.buyEur);

describe('rebalance (buy-only)', () => {
  it('scales the gaps down when they exceed the amount', () => expect(buys([24005.15, 6322.93, 12234.84], [0.55, 0.2, 0.25], 5000)).toEqual([2015.73, 2984.27, 0]));
  it('spreads by weight when already on target', () => expect(buys([50, 30, 20], [0.5, 0.3, 0.2], 100)).toEqual([50, 30, 20]));
  it('never buys an over-target slot', () => expect(buys([100, 0, 0], [0.5, 0.25, 0.25], 100)).toEqual([0, 50, 50]));
  it('fills the biggest gaps proportionally', () => expect(buys([0, 0, 100], [0.5, 0.25, 0.25], 40)).toEqual([26.67, 13.33, 0]));
  it('rebalance with zero amount', () => {
    expect(buys([1, 2, 3], [0.5, 0.25, 0.25], 0)).toEqual([0, 0, 0]);
    expect(buys([1, 2, 3], [0.5, 0.25, 0.25], -5)).toEqual([0, 0, 0]);
  });
});

describe('nextBuyDate', () => {
  it('finds the 1st of the next buy month', () => expect(nextBuyDate('2026-10-17', [1, 7])).toEqual({ date: '2027-01-01', days: 76 }));
  it('counts today when it is the day', () => expect(nextBuyDate('2026-07-01', [1, 7])).toEqual({ date: '2026-07-01', days: 0 }));
  it('wraps to next year', () => expect(nextBuyDate('2026-07-02', [7])!.date).toBe('2027-07-01'));
  it('returns null without buy months', () => expect(nextBuyDate('2026-07-02', [])).toBeNull());
});
