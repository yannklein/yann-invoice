import { describe, expect, it } from 'vitest';
import { expenseBreakdown, expenseCategory, inDisplay, incomeByCurrency, monthTransfer, transfers } from '@/lib/dashboard/household';
import { line, monthRec } from './fixtures/dashboard';

describe('expenseCategory', () => {
  it('sorts every real label of the shared sheet', () => {
    const cases: [string, string][] = [
      ['Rental', 'housing'], ['Half Rental Airbnb', 'housing'], ['Gym', 'subs'], ['Subscription Claude', 'subs'],
      ['Savings', 'savings'], ['Autonomo cotisation', 'tax'], ['Tax Yann Q1', 'tax'], ['Tax 2nd semester', 'tax'],
      ['Spendings', 'other'], ['Additional Spendings', 'other'], ['Miscalc Matinno', 'other'],
    ];
    for (const [label, cat] of cases) expect([label, expenseCategory({ label, inst: null })]).toEqual([label, cat]);
  });
  it('counts any instalment as tax', () => expect(expenseCategory({ label: 'Anything', inst: { total: 3, index: 1, count: 3 } })).toBe('tax'));
});

// Sep: ¥404,000 in, ¥150,000 savings and €500 rent out at 160 → ¥174,000.
// Aug: €1,000 in, ¥200,000 out, saved with rate 0 → falls back to 177 → −¥23,000.
const months = [monthRec('2026-09', 160), monthRec('2026-08', 0)];
const lines = [
  line({ month: '2026-09', kind: 'income', label: 'Matinno', amount: 404000, currency: 'JPY' }),
  line({ month: '2026-09', label: 'Savings', amount: 150000, currency: 'JPY' }),
  line({ month: '2026-09', label: 'Rental', amount: 500, currency: 'EUR' }),
  line({ month: '2026-08', kind: 'income', label: 'LWB', amount: 1000, currency: 'EUR' }),
  line({ month: '2026-08', label: 'Spendings', amount: 200000, currency: 'JPY' }),
];

describe('transfers', () => {
  it('uses each month’s own rate (177 when the saved rate is unusable), sorted by month', () => {
    expect(transfers(months, lines, 'JPY')).toEqual({ points: [{ month: '2026-08', amount: -23000 }, { month: '2026-09', amount: 174000 }], average: 75500 });
    expect(transfers(months, lines, 'EUR')).toEqual({ points: [{ month: '2026-08', amount: -129.94 }, { month: '2026-09', amount: 1087.5 }], average: 478.78 });
  });
  it('gives this month’s transfer, or null when the month is not saved', () => {
    expect(monthTransfer(months, lines, '2026-09', 'JPY')).toBe(174000);
    expect(monthTransfer(months, lines, '2026-10', 'JPY')).toBeNull();
  });
  it('has no points and a zero average with no saved months', () => expect(transfers([], [], 'EUR')).toEqual({ points: [], average: 0 }));
});

describe('expenseBreakdown', () => {
  it('sums expenses per category in the display currency and keeps their labels', () => {
    expect(expenseBreakdown(months, lines, 'EUR').find((p) => p.month === '2026-09')).toEqual({
      month: '2026-09', tax: 0, savings: 937.5, housing: 500, subs: 0, other: 0, labels: { savings: ['Savings'], housing: ['Rental'] },
    });
  });
});

describe('incomeByCurrency', () => {
  it('splits income by the currency it arrived in, with the month rate', () => {
    expect(incomeByCurrency(months, lines, 'JPY')).toEqual([
      { month: '2026-08', fromJpy: 0, fromEur: 177000, fx: 177 },
      { month: '2026-09', fromJpy: 404000, fromEur: 0, fx: 160 },
    ]);
  });
  it('converts both ways', () => {
    expect(inDisplay(500, 'EUR', 'JPY', 160)).toBe(80000);
    expect(inDisplay(80000, 'JPY', 'EUR', 160)).toBe(500);
    expect(inDisplay(12.3456, 'EUR', 'EUR', 160)).toBe(12.35);
  });
});
