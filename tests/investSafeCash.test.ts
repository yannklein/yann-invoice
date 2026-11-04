import { describe, expect, it } from 'vitest';
import { safeCash } from '@/lib/invest/safeCash';
import { line, monthRec } from './fixtures/dashboard';

const income = (month: string, amount: number) => line({ month, kind: 'income', label: 'Client', amount, currency: 'EUR' });
const expense = (month: string, label: string, amount: number) => line({ month, label, amount, currency: 'EUR' });

describe('safeCash', () => {
  it('counts housing, subscriptions, other spending and the transfer, but not taxes or savings', () => {
    // €5,000 in; €1,000 tax and €800 savings stay out; €1,200 rent, €100 gym, €300 other and the €1,600 transfer count: €3,200.
    const lines = [
      income('2026-09', 5000), expense('2026-09', 'Tax Q3', 1000), expense('2026-09', 'Savings', 800),
      expense('2026-09', 'Rental', 1200), expense('2026-09', 'Gym', 100), expense('2026-09', 'Spendings', 300),
    ];
    expect(safeCash([monthRec('2026-09')], lines)).toEqual({ monthlyEur: 3200, safeEur: 19200, months: 6, sampleMonths: 1 });
  });

  it('averages over the months, and a month that overspent lowers the transfer', () => {
    // Aug: €2,000 spent on €2,000 in = €2,000. Sep: €3,000 spent on €1,000 in, transfer −€2,000 = €1,000. Average €1,500.
    const lines = [income('2026-08', 2000), expense('2026-08', 'Rental', 2000), income('2026-09', 1000), expense('2026-09', 'Rental', 3000)];
    expect(safeCash([monthRec('2026-08'), monthRec('2026-09')], lines)?.monthlyEur).toBe(1500);
  });

  it('uses only the latest 12 saved months', () => {
    const old = monthRec('2024-01');
    const recent = Array.from({ length: 12 }, (_, i) => monthRec(`2026-${String(i + 1).padStart(2, '0')}`));
    const lines = [income('2024-01', 90000), ...recent.map((m) => income(m.month, 1000))];
    expect(safeCash([old, ...recent], lines)).toMatchObject({ monthlyEur: 1000, sampleMonths: 12 });
  });

  it('rounds the safe level up to the next €100, never down', () => {
    const lines = [income('2026-09', 3214)];
    expect(safeCash([monthRec('2026-09')], lines)?.safeEur).toBe(19300);
  });

  it('converts yen lines at each month’s own rate', () => {
    expect(safeCash([monthRec('2026-09', 200)], [line({ month: '2026-09', kind: 'income', label: 'Client', amount: 400000, currency: 'JPY' })])?.monthlyEur).toBe(2000);
  });

  it('never goes below zero when taxes and savings outweigh the income of the months sampled', () => {
    // Nothing came in, €1,000 of tax went out: spending €0 + transfer −€1,000.
    expect(safeCash([monthRec('2026-09')], [expense('2026-09', 'Tax Q3', 1000)])).toEqual({ monthlyEur: 0, safeEur: 0, months: 6, sampleMonths: 1 });
  });

  it('gives no level without saved months', () => expect(safeCash([], [])).toBeNull());
});
