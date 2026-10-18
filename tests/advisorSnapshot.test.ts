import { describe, expect, it } from 'vitest';
import type { FinanceData } from '@/lib/advisor/load';
import { renderHousehold, renderInvoices, renderSnapshot, renderTax, table } from '@/lib/advisor/snapshot';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS } from '@/lib/invest/defaults';
import type { PriceSeries } from '@/lib/invest/prices';
import type { Portfolio, Trade } from '@/lib/invest/types';
import { buildView } from '@/lib/invest/view';
import { FX, inv, line, monthRec } from './fixtures/dashboard';

const TODAY = '2026-10-17';
const rows = [
  inv('a', { number: '202609001', clientName: 'Le Wagon', subtotal: 3000, total: 3420, irpfRate: 0.07, vatRate: 0.21 }),
  inv('b', { number: '202609002', clientName: 'Tokyo Co', currency: 'JPY', country: 'JP', subtotal: 320000, total: 287328, withholdingRate: 0.1021 }),
  inv('c', { number: '202510001', clientName: 'Le Wagon', subtotal: 1000, total: 1140 }),
];
const shared = {
  months: [monthRec('2026-08'), monthRec('2026-09')],
  lines: [
    line({ month: '2026-09', kind: 'income', label: 'Le Wagon', amount: 3420, currency: 'EUR', invoiceId: 'a' }),
    line({ month: '2026-09', kind: 'expense', label: 'Rent', amount: 160000 }),
    line({ month: '2026-09', kind: 'expense', label: 'IRPF Q2', amount: 800, currency: 'EUR', inst: { total: 2400, index: 1, count: 3 } }),
    line({ month: '2026-08', kind: 'expense', label: 'Netflix', amount: 1600 }),
  ],
  invalidRows: 0,
};
const trade = (symbol: string, quantity: number, price: number): Trade => ({
  key: symbol, date: '2026-02-01', account: 'U1', symbol, isin: '', currency: 'EUR', quantity, price, commission: 0, amountEur: quantity * price, source: 'transfer', note: '',
});
const p: Portfolio = {
  trades: [trade('IWRD', 10, 90), trade('IMEU', 10, 40), trade('CSBGE3', 10, 116)],
  deposits: [], dividends: [], cash: [], snapshots: [], plan: DEFAULT_PLAN, slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: DEFAULT_BENCHMARKS, invalidRows: 0,
};
const series = (yahoo: string, close: number): PriceSeries => ({ yahoo, currency: 'EUR', points: [{ date: '2026-10-15', close, adj: close }] });
const prices = { 'IWRD.AS': series('IWRD.AS', 93), 'IMEU.AS': series('IMEU.AS', 40), 'CSBGE3.SW': series('CSBGE3.SW', 116.3) };
const data: FinanceData = {
  rows, failed: 0, settings: { irpfRate: 0.07, defaultTerms: 'Due upon receipt' }, shared, fx: FX,
  invest: { p, v: buildView(p, prices, {}, TODAY, null) },
};

describe('table', () => {
  it('renders Markdown and escapes pipes', () => expect(table(['a', 'b'], [['x|y', 1]])).toBe('| a | b |\n| --- | --- |\n| x/y | 1 |'));
  it('notes an empty table', () => expect(table(['a'], [], '_Nothing._')).toBe('_Nothing._'));
});

describe('renderSnapshot', () => {
  const s = renderSnapshot(data, TODAY);
  it('has every section', () => {
    for (const h of ['# Finance snapshot · 2026-10-17', '## Business', '## Tax', '## Household', '## Money today', '## Portfolio', '## Not covered']) expect(s).toContain(h);
  });
  it('totals the last 12 months of revenue in EUR (JPY at 160)', () => expect(s).toContain('Last 12 months: **€5,000** from 2 invoices'));
  it('ranks clients by share', () => expect(s).toMatch(/\| Le Wagon \| €3,000 \| 60% \|/));
  it('lists the JPY invoice as unpaid and the linked one as paid', () => {
    expect(s).toContain('| 202609002 | Tokyo Co | 2026-09 | ¥287,328 | 1 mo |');
    expect(s).not.toContain('| 202609001 | Le Wagon | 2026-09 |');
  });
  it('shows the next filing and instalments in progress', () => {
    expect(s).toContain('Next filing: **Q3 2026**, due 2026-10-20');
    expect(s).toContain('| IRPF Q2 | 1/3 | €800 | €1,600 |');
  });
  it('includes money today and the plan', () => {
    expect(s).toContain('Total: **€2,493**');
    expect(s).toContain('per buy');
  });
  it('flags approximate rates and failed sheets', () => {
    const w = renderSnapshot({ ...data, failed: 2, fx: { ...FX, approximate: true } }, TODAY);
    expect(w).toContain('approximate');
    expect(w).toContain('2 invoice sheet(s) could not be re-read');
  });
  it('copes with no shared account and no portfolio', () => {
    const w = renderSnapshot({ ...data, shared: null, invest: null }, TODAY);
    expect(w).toContain('_The shared account is not imported._');
    expect(w).toContain('_No portfolio sheet is linked._');
  });
});

describe('sections', () => {
  it('sums a tax year per quarter', () => {
    const t = renderTax(data, TODAY, 2026);
    expect(t).toContain('| Q3 | 2026-10-20 | done | €5,000.00 | €630.00 | €210.00 | €204.20 |');
  });
  it('shows household months with income, expense categories and transfer', () => {
    const h = renderHousehold(data, 'JPY');
    expect(h).toContain('2026-08 → 2026-09');
    expect(h).toMatch(/\| 2026-09 \| 160 \| ¥547,200 \|/);
    expect(h).toContain('### Lines of 2026-09');
  });
  it('filters household months by range', () => expect(renderHousehold(data, 'EUR', { from: '2026-09' })).toContain('2026-09 → 2026-09'));
  it('filters invoices by client and unpaid', () => {
    expect(renderInvoices(data, TODAY, { client: 'le wagon' })).toContain('2 invoice(s)');
    const u = renderInvoices(data, TODAY, { unpaidOnly: true });
    expect(u).toContain('1 invoice(s)');
    expect(u).toContain('Tokyo Co');
  });
});
