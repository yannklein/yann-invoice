import type { Fx } from '@/lib/dashboard/convert';
import type { IndexRow } from '@/lib/invoice/derive';
import type { ParsedInvoice } from '@/lib/invoice/types';
import type { Line, MonthRecord } from '@/lib/shared/types';

/** An index row. Defaults: EUR, ES, client ACME, subtotal = total = 100, no taxes. Set `number` to place it in a month. */
export const inv = (fileId: string, p: Partial<ParsedInvoice> & { meta?: IndexRow['meta'] } = {}): IndexRow => {
  const { meta = {}, ...invoice } = p;
  return {
    fileId,
    title: `Invoice ${fileId}`,
    modifiedTime: '2026-10-04T10:00:00.000Z',
    meta,
    invoice: {
      number: null, title: `Invoice ${fileId}`, issueDate: null, terms: null, senderLines: [], clientName: 'ACME', clientLines: ['ACME'],
      country: 'ES', currency: 'EUR', items: [], subtotal: 100, irpfRate: 0, vatRate: 0, withholdingRate: 0, total: 100, notes: [], bankLines: [],
      ...invoice,
    },
  };
};

export const line = (p: Partial<Line>): Line => ({
  month: '2026-09', kind: 'expense', label: 'x', amount: 0, currency: 'JPY', invoiceId: null, inst: null, note: '', ...p,
});

export const monthRec = (month: string, fxJpyPerEur = 160): MonthRecord => ({ month, fxJpyPerEur, note: '', updatedAt: '2026-10-01T00:00:00.000Z' });

/** 160 JPY and 1.2 USD per EUR in every month from 2024-01 (rateFor falls back to the earlier month). */
export const FX: Fx = { rates: { '2024-01': { JPY: 160, USD: 1.2 } }, approximate: false };
