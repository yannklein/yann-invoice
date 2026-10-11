import type { IndexRow } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import { invoiceMonth } from '@/lib/shared/model';
import type { Line, LineCurrency, MonthRecord } from '@/lib/shared/types';
import { convert, type Fx } from './convert';

export type Quarter = 1 | 2 | 3 | 4;
export type QuarterStatus = 'done' | 'so-far' | 'future';

/** All in EUR. */
export interface TaxSums {
  base: number; // Σ subtotal
  vat: number; // VAT charged (Modelo 303)
  irpf: number; // IRPF withheld by Spanish clients (subtracted in Modelo 130)
  withholding: number; // foreign withholding (double-taxation credit)
}

export interface QuarterRow extends TaxSums {
  year: number;
  q: Quarter;
  due: string; // YYYY-MM-DD
  status: QuarterStatus;
}

export const quarterOf = (month: string) => (Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1) as Quarter;

/** Modelo 303/130 deadlines: 20 Apr, 20 Jul, 20 Oct, and 30 Jan of the following year. */
export const dueDate = (year: number, q: Quarter) => (q === 4 ? `${year + 1}-01-30` : `${year}-${['04', '07', '10'][q - 1]}-20`);

function statusOf(year: number, q: Quarter, today: string): QuarterStatus {
  const now = today.slice(0, 7);
  const first = `${year}-${String(q * 3 - 2).padStart(2, '0')}`;
  const last = `${year}-${String(q * 3).padStart(2, '0')}`;
  return now > last ? 'done' : now >= first ? 'so-far' : 'future';
}

const inQuarter = (r: IndexRow, year: number, q: Quarter) => {
  const m = invoiceMonth(r);
  return m.startsWith(`${year}-`) && quarterOf(m) === q;
};

function sums(rows: IndexRow[], fx: Fx): TaxSums {
  let base = 0, vat = 0, irpf = 0, withholding = 0;
  for (const r of rows) {
    const { subtotal, currency, vatRate, irpfRate, withholdingRate } = r.invoice;
    if (subtotal == null) continue;
    const month = invoiceMonth(r);
    // Same rounding as the invoice itself (computeTotals), then to EUR at the invoice month's rate.
    const eur = (x: number) => convert(roundMoney(x, currency), currency, 'EUR', month, fx);
    base += eur(subtotal);
    vat += eur(subtotal * vatRate);
    irpf += eur(subtotal * irpfRate);
    withholding += eur(subtotal * withholdingRate);
  }
  const r = (x: number) => roundMoney(x, 'EUR');
  return { base: r(base), vat: r(vat), irpf: r(irpf), withholding: r(withholding) };
}

const quarterRow = (rows: IndexRow[], year: number, q: Quarter, today: string, fx: Fx): QuarterRow => ({
  year, q, due: dueDate(year, q), status: statusOf(year, q, today), ...sums(rows.filter((r) => inQuarter(r, year, q)), fx),
});

export function taxQuarters(rows: IndexRow[], year: number, today: string, fx: Fx): { quarters: QuarterRow[]; total: TaxSums; skipped: number } {
  const quarters = ([1, 2, 3, 4] as Quarter[]).map((q) => quarterRow(rows, year, q, today, fx));
  const add = (k: keyof TaxSums) => roundMoney(quarters.reduce((a, q) => a + q[k], 0), 'EUR');
  const skipped = rows.filter((r) => r.invoice.subtotal == null && invoiceMonth(r).startsWith(`${year}-`)).length;
  return { quarters, total: { base: add('base'), vat: add('vat'), irpf: add('irpf'), withholding: add('withholding') }, skipped };
}

/** The quarter whose filing deadline is today or the next one to come. */
export function nextFiling(rows: IndexRow[], today: string, fx: Fx): QuarterRow {
  const y = Number(today.slice(0, 4));
  const candidates: [number, Quarter][] = [[y - 1, 4], [y, 1], [y, 2], [y, 3], [y, 4]];
  const [year, q] = candidates.find(([cy, cq]) => dueDate(cy, cq) >= today)!; // [y, 4] is due next January, so one always matches
  return quarterRow(rows, year, q, today, fx);
}

export interface InstalmentRow {
  label: string;
  index: number;
  count: number;
  amount: number; // this payment, in the line's currency
  currency: LineCurrency;
  remaining: number; // after this payment
}

/** Instalments of the latest saved month (finished ones are gone by then, as carryForward drops them). */
export function instalmentsInProgress(months: MonthRecord[], lines: Line[]): InstalmentRow[] {
  const latest = months.map((m) => m.month).sort().at(-1);
  return lines
    .filter((l) => l.month === latest && l.kind === 'expense' && l.inst)
    .map((l) => ({
      label: l.label,
      index: l.inst!.index,
      count: l.inst!.count,
      amount: l.amount,
      currency: l.currency,
      remaining: Math.max(0, roundMoney(l.inst!.total - l.inst!.index * l.amount, l.currency)),
    }));
}
