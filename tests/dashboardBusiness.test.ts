import { describe, expect, it } from 'vitest';
import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid } from '@/lib/dashboard/business';
import { periodMonths } from '@/lib/dashboard/period';
import { FX, inv, line } from './fixtures/dashboard';

const months = periodMonths({ kind: '12m' }, '2026-10'); // 2025-11 … 2026-10
const rows = [
  inv('a', { number: '202609001', clientName: 'Matinno', currency: 'JPY', subtotal: 400000, total: 400000, country: 'JP' }),
  inv('b', { number: '202609002', clientName: 'Le Wagon BCN', subtotal: 1000, total: 930, irpfRate: 0.07 }),
  inv('c', { number: '202608001', clientName: 'le wagon bcn ', subtotal: 500, total: 465 }),
  inv('d', { number: '202508001', clientName: 'Matinno', currency: 'JPY', subtotal: 320000, total: 320000, country: 'JP' }),
  inv('e', { number: '202609003', clientName: 'Broken', subtotal: null, total: null }),
];

describe('revenueEntries / skippedIn', () => {
  it('converts subtotals at their month rate and skips invoices without one', () => {
    expect(revenueEntries(rows, 'EUR', FX).map((e) => [e.row.fileId, e.month, e.amount])).toEqual([
      ['a', '2026-09', 2500], ['b', '2026-09', 1000], ['c', '2026-08', 500], ['d', '2025-08', 2000],
    ]);
    expect(skippedIn(rows, months, 'subtotal')).toBe(1);
  });
});

describe('revenueByMonth', () => {
  it('stacks by client, compares with the same months a year earlier', () => {
    const r = revenueByMonth(revenueEntries(rows, 'EUR', FX), months, 'EUR');
    expect(r.series).toEqual([{ slot: 's1', name: 'Matinno' }, { slot: 's2', name: 'Le Wagon BCN' }]);
    expect(r.months.find((p) => p.month === '2026-09')).toEqual({ month: '2026-09', total: 3500, lastYear: 0, s1: 2500, s2: 1000 });
    expect(r.months.find((p) => p.month === '2026-08')).toEqual({ month: '2026-08', total: 500, lastYear: 2000, s2: 500 });
    expect([r.total, r.previousTotal, r.changePct]).toEqual([4000, 2000, 1]);
  });
  it('keeps the 4 largest clients and folds the rest into Other', () => {
    const many = [600, 500, 400, 300, 200, 100].map((s, i) => inv(`x${i}`, { number: `20260900${i + 1}`, clientName: `C${i + 1}`, subtotal: s }));
    const r = revenueByMonth(revenueEntries(many, 'EUR', FX), months, 'EUR');
    expect(r.series.map((s) => s.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'Other']);
    expect(r.months.find((p) => p.month === '2026-09')).toEqual({ month: '2026-09', total: 2100, lastYear: 0, s1: 600, s2: 500, s3: 400, s4: 300, other: 300 });
  });
  it('handles no invoices at all', () => {
    const r = revenueByMonth([], months, 'EUR');
    expect(r.series).toEqual([]);
    expect(r.months).toHaveLength(12);
    expect([r.total, r.changePct]).toEqual([0, null]);
  });
});

describe('shareBy', () => {
  const entries = revenueEntries(rows, 'EUR', FX);
  it('groups clients by clientKey, named after the newest invoice', () => {
    expect(shareBy(entries, months, 'EUR', byClient)).toEqual([
      { key: 'MATINNO', name: 'Matinno', amount: 2500, pct: 0.625 },
      { key: 'LE WAGON BCN', name: 'Le Wagon BCN', amount: 1500, pct: 0.375 },
    ]);
  });
  it('splits by country and service type', () => {
    expect(shareBy(entries, months, 'EUR', byCountry).map((r) => [r.name, r.amount])).toEqual([['JP', 2500], ['ES', 1500]]);
    const mixed = [inv('t', { number: '202609001', subtotal: 300 }), inv('o', { number: '202609002', subtotal: 100, vatRate: 0.21 })];
    expect(shareBy(revenueEntries(mixed, 'EUR', FX), months, 'EUR', byService).map((r) => [r.name, r.amount])).toEqual([['Teaching', 300], ['Other', 100]]);
  });
});

describe('unpaid', () => {
  it('lists unlinked JPY/EUR invoices since 2025-07, oldest first, with a total in the display currency', () => {
    const list = [
      inv('old', { number: '202506001' }),
      inv('usd', { number: '202608009', currency: 'USD', total: 120 }),
      inv('b', { number: '202609002', total: 930 }),
      inv('c', { number: '202608001', clientName: 'LWB', total: 465 }),
      inv('a', { number: '202609001', clientName: 'Matinno', currency: 'JPY', total: 400000 }),
      inv('n', { number: '202609004', total: null }),
      inv('future', { number: '202612001', total: 50 }),
    ];
    const lines = [line({ month: '2026-10', kind: 'income', invoiceId: 'b', amount: 930, currency: 'EUR' })];
    const u = unpaid(list, lines, '2026-10', 'EUR', FX);
    expect(u.rows.map((r) => [r.fileId, r.month, r.ageMonths])).toEqual([['c', '2026-08', 2], ['a', '2026-09', 1], ['future', '2026-12', 0]]);
    expect(u.rows[0]).toEqual({ fileId: 'c', number: '202608001', client: 'LWB', month: '2026-08', total: 465, currency: 'EUR', ageMonths: 2 });
    expect(u.total).toBe(3015);
  });
});

describe('paymentDelay', () => {
  it('gives the median months from invoice to bank per client, ignoring unknown invoices and expenses', () => {
    const list = [
      inv('a', { number: '202608001', clientName: 'Matinno' }), inv('b', { number: '202609001', clientName: 'Matinno' }),
      inv('c', { number: '202607001', clientName: 'LWB' }), inv('d', { number: '202608002', clientName: 'LWB' }),
    ];
    const lines = [
      line({ kind: 'income', month: '2026-08', invoiceId: 'a' }), line({ kind: 'income', month: '2026-10', invoiceId: 'b' }),
      line({ kind: 'income', month: '2026-08', invoiceId: 'c' }), line({ kind: 'income', month: '2026-10', invoiceId: 'd' }),
      line({ kind: 'income', month: '2026-10', invoiceId: 'gone' }), line({ kind: 'expense', month: '2026-10', invoiceId: 'a' }),
    ];
    expect(paymentDelay(list, lines)).toEqual([
      { key: 'LWB', name: 'LWB', months: 1.5, count: 2 },
      { key: 'MATINNO', name: 'Matinno', months: 0.5, count: 2 },
    ]);
  });
});
