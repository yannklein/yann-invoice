import { roundMoney } from '@/lib/invoice/totals';
import { totals } from '@/lib/shared/model';
import type { Line, LineCurrency, MonthRecord } from '@/lib/shared/types';
import { FALLBACK_PER_EUR } from './convert';
import type { DisplayCurrency } from './period';

/** In chart order: slots 1–4, then the grey "Other". */
export const EXPENSE_CATEGORIES = [
  { id: 'tax', label: 'Taxes & social security' },
  { id: 'savings', label: 'Savings' },
  { id: 'housing', label: 'Housing' },
  { id: 'subs', label: 'Subscriptions & gym' },
  { id: 'other', label: 'Other' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id'];

const RULES: [ExpenseCategory, RegExp][] = [
  ['tax', /tax|irpf|\biva\b|hacienda|aut[oó]nomo|cotisation|cuota|seguridad social/i],
  ['savings', /saving/i],
  ['housing', /rent|alquiler|airbnb/i],
  ['subs', /subscription|gym|netflix|spotify/i],
];

/** Expense labels are free text; the first matching rule wins. Any instalment is a tax payment. */
export function expenseCategory(l: Pick<Line, 'label' | 'inst'>): ExpenseCategory {
  if (l.inst) return 'tax';
  return RULES.find(([, re]) => re.test(l.label))?.[0] ?? 'other';
}

const fxOf = (m: MonthRecord) => (m.fxJpyPerEur > 0 ? m.fxJpyPerEur : FALLBACK_PER_EUR.JPY);
const byMonth = (months: MonthRecord[]) => [...months].sort((a, b) => a.month.localeCompare(b.month));
const linesOf = (lines: Line[], month: string) => lines.filter((l) => l.month === month);

/** A shared-account amount in the display currency, at that month's own JPY/EUR rate. */
export function inDisplay(amount: number, from: LineCurrency, ccy: DisplayCurrency, fx: number): number {
  if (from === ccy) return roundMoney(amount, ccy);
  return roundMoney(from === 'EUR' ? amount * fx : amount / fx, ccy);
}

function transferOf(m: MonthRecord, lines: Line[], ccy: DisplayCurrency): number {
  const t = totals(linesOf(lines, m.month), fxOf(m));
  return ccy === 'JPY' ? t.transferJpy : t.transferEur;
}

export interface TransferPoint {
  month: string;
  amount: number;
}

export function transfers(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): { points: TransferPoint[]; average: number } {
  const points = byMonth(months).map((m) => ({ month: m.month, amount: transferOf(m, lines, ccy) }));
  const average = points.length ? roundMoney(points.reduce((a, p) => a + p.amount, 0) / points.length, ccy) : 0;
  return { points, average };
}

export function monthTransfer(months: MonthRecord[], lines: Line[], month: string, ccy: DisplayCurrency): number | null {
  const m = months.find((x) => x.month === month);
  return m ? transferOf(m, lines, ccy) : null;
}

export type ExpensePoint = { month: string; labels: Partial<Record<ExpenseCategory, string[]>> } & Record<ExpenseCategory, number>;

export function expenseBreakdown(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): ExpensePoint[] {
  return byMonth(months).map((m) => {
    const p: ExpensePoint = { month: m.month, tax: 0, savings: 0, housing: 0, subs: 0, other: 0, labels: {} };
    for (const l of linesOf(lines, m.month)) {
      if (l.kind !== 'expense') continue;
      const c = expenseCategory(l);
      p[c] = roundMoney(p[c] + inDisplay(l.amount, l.currency, ccy, fxOf(m)), ccy);
      (p.labels[c] ??= []).push(l.label);
    }
    return p;
  });
}

export interface IncomeCurrencyPoint {
  month: string;
  fromJpy: number; // income that arrived in yen, in the display currency
  fromEur: number; // income that arrived in euros, in the display currency
  fx: number; // the month's JPY per EUR
}

export function incomeByCurrency(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): IncomeCurrencyPoint[] {
  return byMonth(months).map((m) => {
    const p = { month: m.month, fromJpy: 0, fromEur: 0, fx: fxOf(m) };
    for (const l of linesOf(lines, m.month)) {
      if (l.kind !== 'income') continue;
      const key = l.currency === 'JPY' ? 'fromJpy' : 'fromEur';
      p[key] = roundMoney(p[key] + inDisplay(l.amount, l.currency, ccy, p.fx), ccy);
    }
    return p;
  });
}
