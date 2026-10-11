import { describe, expect, it } from 'vitest';
import { dueDate, instalmentsInProgress, nextFiling, quarterOf, taxQuarters } from '@/lib/dashboard/tax';
import { FX, inv, line, monthRec } from './fixtures/dashboard';

const rows = [
  inv('a', { number: '202602001', subtotal: 1000, vatRate: 0.21, irpfRate: 0.07 }),
  inv('b', { number: '202608001', currency: 'JPY', country: 'JP', subtotal: 400000, withholdingRate: 0.1021 }),
  inv('c', { number: '202609002', subtotal: 500, irpfRate: 0.07 }),
  inv('d', { number: '202609003', subtotal: null }),
  inv('e', { number: '202512001', subtotal: 999, vatRate: 0.21 }),
];

describe('quarters and deadlines', () => {
  it('maps months to quarters', () => expect(['2026-01', '2026-03', '2026-04', '2026-12'].map(quarterOf)).toEqual([1, 1, 2, 4]));
  it('gives Spanish filing deadlines, Q4 in the following January', () => {
    expect([dueDate(2026, 1), dueDate(2026, 2), dueDate(2026, 3), dueDate(2026, 4)]).toEqual(['2026-04-20', '2026-07-20', '2026-10-20', '2027-01-30']);
  });
});

describe('taxQuarters', () => {
  it('sums base, VAT, IRPF and foreign withholding per quarter in EUR', () => {
    const t = taxQuarters(rows, 2026, '2026-10-12', FX);
    expect(t.quarters).toEqual([
      { year: 2026, q: 1, due: '2026-04-20', status: 'done', base: 1000, vat: 210, irpf: 70, withholding: 0 },
      { year: 2026, q: 2, due: '2026-07-20', status: 'done', base: 0, vat: 0, irpf: 0, withholding: 0 },
      { year: 2026, q: 3, due: '2026-10-20', status: 'done', base: 3000, vat: 0, irpf: 35, withholding: 255.25 },
      { year: 2026, q: 4, due: '2027-01-30', status: 'so-far', base: 0, vat: 0, irpf: 0, withholding: 0 },
    ]);
    expect(t.total).toEqual({ base: 4000, vat: 210, irpf: 105, withholding: 255.25 });
    expect(t.skipped).toBe(1);
  });
  it('marks quarters of a later year as future', () => {
    expect(taxQuarters(rows, 2027, '2026-10-12', FX).quarters.map((q) => q.status)).toEqual(['future', 'future', 'future', 'future']);
  });
});

describe('nextFiling', () => {
  it('is the quarter whose deadline comes next', () => {
    expect(nextFiling(rows, '2026-10-12', FX)).toMatchObject({ year: 2026, q: 3, status: 'done', irpf: 35 });
    expect(nextFiling(rows, '2026-10-20', FX)).toMatchObject({ year: 2026, q: 3 });
    expect(nextFiling(rows, '2026-10-21', FX)).toMatchObject({ year: 2026, q: 4, status: 'so-far' });
    expect(nextFiling(rows, '2027-01-15', FX)).toMatchObject({ year: 2026, q: 4, status: 'done' });
  });
});

describe('instalmentsInProgress', () => {
  it('lists the latest saved month’s instalments with what is left', () => {
    const months = [monthRec('2026-09'), monthRec('2026-08')];
    const lines = [
      line({ month: '2026-08', label: 'Tax 2nd semester', amount: 866, currency: 'EUR', inst: { total: 2598, index: 1, count: 3 } }),
      line({ month: '2026-09', label: 'Tax 2nd semester', amount: 866, currency: 'EUR', inst: { total: 2598, index: 2, count: 3 } }),
      line({ month: '2026-09', label: 'Odd edit', amount: 2000, currency: 'EUR', inst: { total: 3000, index: 2, count: 2 } }),
      line({ month: '2026-09', label: 'Gym', amount: 18000 }),
    ];
    expect(instalmentsInProgress(months, lines)).toEqual([
      { label: 'Tax 2nd semester', index: 2, count: 3, amount: 866, currency: 'EUR', remaining: 866 },
      { label: 'Odd edit', index: 2, count: 2, amount: 2000, currency: 'EUR', remaining: 0 },
    ]);
  });
  it('is empty with no saved months', () => expect(instalmentsInProgress([], [])).toEqual([]));
});
