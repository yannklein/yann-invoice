import { describe, expect, it } from 'vitest';
import { computeTotals, formatMoney } from '@/lib/invoice/totals';

const item = (quantity: number, unitPrice: number) => ({ description: 'x', quantity, unitPrice });

describe('computeTotals', () => {
  it('matches 202609003 (IRPF 7%)', () => {
    expect(computeTotals([item(1, 100)], { vatRate: 0, irpfRate: 0.07, withholdingRate: 0 }, 'EUR')).toEqual({ subtotal: 100, vat: 0, irpf: 7, withholding: 0, total: 93 });
  });
  it('matches 202606004 (JPY, 10.21% withholding)', () => {
    expect(computeTotals([item(1, 450000)], { vatRate: 0, irpfRate: 0, withholdingRate: 0.1021 }, 'JPY')).toEqual({ subtotal: 450000, vat: 0, irpf: 0, withholding: 45945, total: 404055 });
  });
  it('rounds JPY to whole yen', () => {
    const t = computeTotals([item(1, 33333)], { vatRate: 0, irpfRate: 0, withholdingRate: 0.1021 }, 'JPY');
    expect(t.withholding).toBe(3403);
    expect(t.total).toBe(29930);
  });
  it('Spain + other: 21% IVA added, IRPF subtracted', () => {
    expect(computeTotals([item(2, 75)], { vatRate: 0.21, irpfRate: 0.07, withholdingRate: 0 }, 'EUR')).toEqual({ subtotal: 150, vat: 31.5, irpf: 10.5, withholding: 0, total: 171 });
  });
  it('avoids float noise in subtotals', () => {
    expect(computeTotals([item(3, 0.1)], { vatRate: 0, irpfRate: 0, withholdingRate: 0 }, 'EUR').subtotal).toBe(0.3);
  });
});

describe('formatMoney', () => {
  it('formats like the historical sheets', () => {
    expect(formatMoney(93, 'EUR')).toBe('€93.00');
    expect(formatMoney(404055, 'JPY')).toBe('¥404,055');
    expect(formatMoney(1500, 'EUR')).toBe('€1,500.00');
  });
});
