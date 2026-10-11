import type { IndexRow } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import type { Instalment, Line, LineCurrency } from './types';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export const instalmentAmount = (inst: Instalment, currency: LineCurrency) => roundMoney(inst.total / inst.count, currency);

const validFx = (fx: number) => (Number.isFinite(fx) && fx > 0 ? fx : 0);

export const toJpy = (l: Pick<Line, 'amount' | 'currency'>, fx: number) =>
  roundMoney(l.currency === 'JPY' ? l.amount : l.amount * validFx(fx), 'JPY');

export interface MonthTotals {
  incomeJpy: number;
  expenseJpy: number;
  transferJpy: number;
  transferEur: number;
  byCurrency: Record<Line['kind'], Record<LineCurrency, number>>;
}

export function totals(lines: Line[], fx: number): MonthTotals {
  const byCurrency = { income: { JPY: 0, EUR: 0 }, expense: { JPY: 0, EUR: 0 } };
  let incomeJpy = 0;
  let expenseJpy = 0;
  for (const l of lines) {
    const amount = Number.isFinite(l.amount) ? l.amount : 0;
    byCurrency[l.kind][l.currency] = roundMoney(byCurrency[l.kind][l.currency] + amount, l.currency);
    const jpy = toJpy({ amount, currency: l.currency }, fx);
    if (l.kind === 'income') incomeJpy += jpy;
    else expenseJpy += jpy;
  }
  const transferJpy = incomeJpy - expenseJpy;
  const rate = validFx(fx);
  return { incomeJpy, expenseJpy, transferJpy, transferEur: rate ? roundMoney(transferJpy / rate, 'EUR') : 0, byCurrency };
}

/** Default lines for a new month: last month's expenses, instalments moved on by one. Income never carries over. */
export function carryForward(prev: Line[], month: string): Line[] {
  const out: Line[] = [];
  for (const l of prev) {
    if (l.kind !== 'expense') continue;
    if (l.inst && l.inst.index >= l.inst.count) continue;
    const inst = l.inst && { ...l.inst, index: l.inst.index + 1 };
    out.push({ ...l, month, note: '', inst, amount: inst ? instalmentAmount(inst, l.currency) : l.amount });
  }
  return out;
}

/**
 * Month an invoice belongs to. Legacy sheets report today's date as their issue date (probably `=TODAY()`),
 * so the number's YYYYMM wins, then the earlier of issueDate and the Drive modification date.
 */
export function invoiceMonth(r: IndexRow): string {
  const m = r.invoice.number?.match(/^(\d{4})(\d{2})/);
  if (m && MONTH_RE.test(`${m[1]}-${m[2]}`)) return `${m[1]}-${m[2]}`;
  const dates = [r.invoice.issueDate, r.modifiedTime.slice(0, 10)].filter((d): d is string => !!d).sort();
  return dates[0].slice(0, 7);
}

const isLineCurrency = (c: string): c is LineCurrency => c === 'JPY' || c === 'EUR';

/** Invoices that may have been paid this month: issued in the last 3 months and not already counted in another month. */
export function candidateInvoices(rows: IndexRow[], lines: Line[], month: string): IndexRow[] {
  const from = addMonths(month, -3);
  const linkedElsewhere = new Set(lines.filter((l) => l.invoiceId && l.month !== month).map((l) => l.invoiceId));
  return rows
    .map((r) => ({ r, m: invoiceMonth(r) }))
    .filter(({ r, m }) => m >= from && m <= month && !linkedElsewhere.has(r.fileId) && r.invoice.total != null && isLineCurrency(r.invoice.currency))
    .sort((a, b) => b.m.localeCompare(a.m) || (b.r.invoice.number ?? '').localeCompare(a.r.invoice.number ?? ''))
    .map(({ r }) => r);
}

export function incomeFromInvoice(r: IndexRow, month: string): Line {
  return {
    month,
    kind: 'income',
    label: `${r.invoice.clientName} ${r.invoice.number ?? r.title}`,
    amount: r.invoice.total ?? 0,
    currency: r.invoice.currency === 'JPY' ? 'JPY' : 'EUR',
    invoiceId: r.fileId,
    inst: null,
    note: '',
  };
}
