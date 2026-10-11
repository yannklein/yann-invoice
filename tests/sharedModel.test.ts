import { describe, expect, it } from 'vitest';
import type { IndexRow } from '@/lib/invoice/derive';
import type { ParsedInvoice } from '@/lib/invoice/types';
import { addMonths, candidateInvoices, carryForward, incomeFromInvoice, invoiceMonth, totals } from '@/lib/shared/model';
import type { Line } from '@/lib/shared/types';

const line = (p: Partial<Line>): Line => ({
  month: '2026-09', kind: 'expense', label: 'x', amount: 0, currency: 'JPY', invoiceId: null, inst: null, note: '', ...p,
});

const invoiceRow = (p: { fileId: string; number?: string | null; issueDate?: string | null; modifiedTime?: string; total?: number | null; currency?: ParsedInvoice['currency'] }): IndexRow => ({
  fileId: p.fileId,
  title: `Invoice ${p.fileId}`,
  modifiedTime: p.modifiedTime ?? '2026-10-04T10:00:00.000Z',
  meta: {},
  invoice: {
    number: p.number ?? null, title: `Invoice ${p.fileId}`, issueDate: p.issueDate ?? null, terms: null, senderLines: [],
    clientName: 'ACME', clientLines: ['ACME'], country: 'ES', currency: p.currency ?? 'EUR', items: [], subtotal: null,
    irpfRate: 0, vatRate: 0, withholdingRate: 0, total: p.total === undefined ? 100 : p.total, notes: [], bankLines: [],
  },
});

describe('addMonths', () => {
  it('crosses year boundaries both ways', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -3)).toBe('2025-10');
  });
});

describe('totals', () => {
  it('converts EUR with the month rate and rounds the transfer', () => {
    const t = totals([
      line({ kind: 'income', amount: 404000, currency: 'JPY' }),
      line({ kind: 'income', amount: 5696.25, currency: 'EUR' }),
      line({ kind: 'expense', amount: 200000, currency: 'JPY' }),
      line({ kind: 'expense', amount: 21.78, currency: 'EUR' }),
    ], 185.33);
    expect(t.incomeJpy).toBe(404000 + 1055686);
    expect(t.expenseJpy).toBe(200000 + 4036);
    expect(t.transferJpy).toBe(1459686 - 204036);
    expect(t.transferEur).toBe(Math.round((1255650 / 185.33) * 100) / 100);
    expect(t.byCurrency.income).toEqual({ JPY: 404000, EUR: 5696.25 });
    expect(t.byCurrency.expense).toEqual({ JPY: 200000, EUR: 21.78 });
  });
  it('allows a negative transfer', () => {
    expect(totals([line({ kind: 'expense', amount: 1000 })], 180).transferJpy).toBe(-1000);
  });
  it('treats a non-positive rate as zero EUR value instead of dividing by zero', () => {
    const t = totals([line({ kind: 'income', amount: 1000 }), line({ kind: 'income', amount: 10, currency: 'EUR' })], 0);
    expect(t.transferJpy).toBe(1000);
    expect(t.transferEur).toBe(0);
  });
});

describe('carryForward', () => {
  const prev = [
    line({ kind: 'income', label: 'Matinno', amount: 404000, invoiceId: 'f1' }),
    line({ kind: 'income', label: 'Add income', amount: 530, currency: 'EUR' }),
    line({ kind: 'expense', label: 'Savings', amount: 150000, note: 'kept' }),
    line({ kind: 'expense', label: 'Tax', amount: 866, currency: 'EUR', inst: { total: 2598, index: 2, count: 3 } }),
    line({ kind: 'expense', label: 'Old tax', amount: 100, currency: 'EUR', inst: { total: 300, index: 3, count: 3 } }),
  ];
  const next = carryForward(prev, '2026-10');
  it('drops every income line, from an invoice or not', () => {
    expect(next.filter((l) => l.kind === 'income')).toEqual([]);
  });
  it('copies expenses into the new month with notes cleared', () => {
    expect(next[0]).toEqual(line({ month: '2026-10', label: 'Savings', amount: 150000 }));
  });
  it('advances running instalments, resets their amount, and drops finished ones', () => {
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ label: 'Tax', amount: 866, inst: { total: 2598, index: 3, count: 3 } });
  });
  it('recomputes the instalment share even if last month was edited', () => {
    const [l] = carryForward([line({ amount: 1, currency: 'EUR', inst: { total: 1000, index: 1, count: 3 } })], '2026-10');
    expect(l.amount).toBe(333.33);
  });
});

describe('invoiceMonth', () => {
  it('prefers the YYYYMM of the number, ignoring suffixes', () => {
    expect(invoiceMonth(invoiceRow({ fileId: 'a', number: '202608001b', issueDate: '2026-10-04' }))).toBe('2026-08');
  });
  it('falls back to the earlier of issueDate and modifiedTime', () => {
    expect(invoiceMonth(invoiceRow({ fileId: 'a', issueDate: '2026-10-04', modifiedTime: '2026-01-29T14:53:11Z' }))).toBe('2026-01');
    expect(invoiceMonth(invoiceRow({ fileId: 'a', issueDate: '2026-09-30', modifiedTime: '2026-10-06T14:06:16Z' }))).toBe('2026-09');
    expect(invoiceMonth(invoiceRow({ fileId: 'a', issueDate: null, modifiedTime: '2025-11-06T12:00:00Z' }))).toBe('2025-11');
  });
  it('ignores a number whose month is invalid', () => {
    expect(invoiceMonth(invoiceRow({ fileId: 'a', number: '202613001', issueDate: '2026-05-01', modifiedTime: '2026-06-01T00:00:00Z' }))).toBe('2026-05');
  });
});

describe('candidateInvoices', () => {
  const rows = [
    invoiceRow({ fileId: 'oct', number: '202610001' }),
    invoiceRow({ fileId: 'sep', number: '202609006', currency: 'JPY' }),
    invoiceRow({ fileId: 'jul', number: '202607001' }),
    invoiceRow({ fileId: 'jun', number: '202606001' }),
    invoiceRow({ fileId: 'nov', number: '202611001' }),
    invoiceRow({ fileId: 'usd', number: '202609001', currency: 'USD' }),
    invoiceRow({ fileId: 'nototal', number: '202609002', total: null }),
    invoiceRow({ fileId: 'linkedElsewhere', number: '202609003' }),
    invoiceRow({ fileId: 'linkedHere', number: '202609004' }),
  ];
  const lines = [
    line({ month: '2026-09', kind: 'income', invoiceId: 'linkedElsewhere' }),
    line({ month: '2026-10', kind: 'income', invoiceId: 'linkedHere' }),
  ];
  const ids = candidateInvoices(rows, lines, '2026-10').map((r) => r.fileId);
  it('keeps invoices from month−3 to month inclusive', () => {
    expect(ids).toEqual(expect.arrayContaining(['oct', 'sep', 'jul']));
    expect(ids).not.toContain('jun');
    expect(ids).not.toContain('nov');
  });
  it('hides invoices linked by another month but keeps this month’s links', () => {
    expect(ids).not.toContain('linkedElsewhere');
    expect(ids).toContain('linkedHere');
  });
  it('skips currencies other than JPY/EUR and invoices without a total', () => {
    expect(ids).not.toContain('usd');
    expect(ids).not.toContain('nototal');
  });
  it('lists newest first', () => {
    expect(ids[0]).toBe('oct');
    expect(ids[ids.length - 1]).toBe('jul');
  });
});

describe('incomeFromInvoice', () => {
  it('builds a linked income line', () => {
    expect(incomeFromInvoice(invoiceRow({ fileId: 'f', number: '202609006', total: 404055, currency: 'JPY' }), '2026-10')).toEqual(
      line({ month: '2026-10', kind: 'income', label: 'ACME 202609006', amount: 404055, currency: 'JPY', invoiceId: 'f' }),
    );
  });
  it('uses the title when there is no number', () => {
    expect(incomeFromInvoice(invoiceRow({ fileId: 'f' }), '2026-10').label).toBe('ACME Invoice f');
  });
});
