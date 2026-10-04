import type { Currency, LineItem } from './types';

export interface Rates {
  vatRate: number;
  irpfRate: number;
  withholdingRate: number;
}

export interface Totals {
  subtotal: number;
  vat: number;
  irpf: number;
  withholding: number;
  total: number;
}

export const decimalsFor = (c: Currency): 0 | 2 => (c === 'JPY' ? 0 : 2);

export function roundMoney(x: number, c: Currency): number {
  const f = 10 ** decimalsFor(c);
  return Math.round((x + Number.EPSILON) * f) / f;
}

export function computeTotals(items: LineItem[], rates: Rates, currency: Currency): Totals {
  const r = (x: number) => roundMoney(x, currency);
  const subtotal = r(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
  const vat = r(subtotal * rates.vatRate);
  const irpf = r(subtotal * rates.irpfRate);
  const withholding = r(subtotal * rates.withholdingRate);
  return { subtotal, vat, irpf, withholding, total: r(subtotal + vat - irpf - withholding) };
}

export function formatMoney(x: number, c: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(x);
}
