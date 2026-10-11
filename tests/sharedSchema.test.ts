import { describe, expect, it } from 'vitest';
import { monthFormSchema, toLines, type MonthForm } from '@/lib/shared/schema';

const form = (p: Partial<MonthForm> = {}): MonthForm => ({
  month: '2026-10',
  fxJpyPerEur: 177.2,
  note: '',
  lines: [
    { kind: 'income', label: ' Matinno ', amount: 404055, currency: 'JPY', invoiceId: 'f1', inst: null, note: '' },
    { kind: 'expense', label: 'Tax', amount: 866.004, currency: 'EUR', invoiceId: null, inst: { total: 2598, index: 2, count: 3 }, note: 'x' },
  ],
  ...p,
});

describe('monthFormSchema', () => {
  it('accepts a normal month', () => expect(monthFormSchema.safeParse(form()).success).toBe(true));
  it('rejects a bad month, rate or empty label', () => {
    expect(monthFormSchema.safeParse(form({ month: '2026-13' })).success).toBe(false);
    expect(monthFormSchema.safeParse(form({ fxJpyPerEur: 0 })).success).toBe(false);
    expect(monthFormSchema.safeParse(form({ lines: [{ ...form().lines[0], label: ' ' }] })).success).toBe(false);
  });
  it('rejects NaN amounts (an emptied number input)', () => {
    expect(monthFormSchema.safeParse(form({ lines: [{ ...form().lines[0], amount: NaN }] })).success).toBe(false);
  });
  it('rejects an instalment index past its count', () => {
    expect(monthFormSchema.safeParse(form({ lines: [{ ...form().lines[1], inst: { total: 1, index: 4, count: 3 } }] })).success).toBe(false);
  });
  it('rejects the same invoice twice in one month', () => {
    const l = form().lines[0];
    expect(monthFormSchema.safeParse(form({ lines: [l, l] })).success).toBe(false);
  });
});

describe('toLines', () => {
  it('stamps the month, trims labels and rounds to the currency', () => {
    expect(toLines(form())).toEqual([
      { month: '2026-10', kind: 'income', label: 'Matinno', amount: 404055, currency: 'JPY', invoiceId: 'f1', inst: null, note: '' },
      { month: '2026-10', kind: 'expense', label: 'Tax', amount: 866, currency: 'EUR', invoiceId: null, inst: { total: 2598, index: 2, count: 3 }, note: 'x' },
    ]);
  });
});
