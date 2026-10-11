import { MONTH_RE } from './model';
import type { Instalment, Line, MonthRecord } from './types';

export const LINES_HEADER = ['month', 'kind', 'label', 'amount', 'currency', 'invoiceId', 'instTotal', 'instIndex', 'instCount', 'note'];
export const MONTHS_HEADER = ['month', 'fxJpyPerEur', 'note', 'updatedAt'];

type Cell = string | number;
const str = (x: unknown) => String(x ?? '').trim();
const num = (x: unknown) => (str(x) === '' ? NaN : Number(str(x)));

export function lineToValues(l: Line): Cell[] {
  return [l.month, l.kind, l.label, l.amount, l.currency, l.invoiceId ?? '', l.inst?.total ?? '', l.inst?.index ?? '', l.inst?.count ?? '', l.note];
}

function instFrom(total: number, index: number, count: number): Instalment | null {
  const ok = total > 0 && Number.isInteger(index) && Number.isInteger(count) && index >= 1 && index <= count;
  return ok ? { total, index, count } : null;
}

export function valuesToLine(v: unknown[]): Line | null {
  const [month, kind, label, amount, currency, invoiceId, instTotal, instIndex, instCount, note] = v.map(str);
  const value = num(amount);
  if (!MONTH_RE.test(month ?? '') || (kind !== 'income' && kind !== 'expense')) return null;
  if ((currency !== 'JPY' && currency !== 'EUR') || !Number.isFinite(value)) return null;
  return {
    month, kind, label: label ?? '', amount: value, currency,
    invoiceId: invoiceId || null,
    inst: instFrom(num(instTotal), num(instIndex), num(instCount)),
    note: note ?? '',
  };
}

export function monthToValues(m: MonthRecord): Cell[] {
  return [m.month, m.fxJpyPerEur, m.note, m.updatedAt];
}

export function valuesToMonth(v: unknown[]): MonthRecord | null {
  const [month, fx, note, updatedAt] = v.map(str);
  const rate = num(fx);
  if (!MONTH_RE.test(month ?? '') || !(rate > 0)) return null;
  return { month, fxJpyPerEur: rate, note: note ?? '', updatedAt: updatedAt ?? '' };
}

/**
 * Raw sheet rows (month in column A) with one month's rows swapped for `fresh`. Months stay in order and rows keep
 * their order within a month. Rows of other months are kept exactly as read, even ones that do not parse.
 */
export function replaceMonthRows(rows: unknown[][], month: string, fresh: Cell[][]): unknown[][] {
  const rest = rows.filter((r) => str(r[0]) !== month);
  return [...rest, ...fresh]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => str(a.r[0]).localeCompare(str(b.r[0])) || a.i - b.i)
    .map(({ r }) => r);
}

/** Pad with blank rows up to `previousCount`, so one update both writes the new rows and blanks stale ones. */
export function padRows(rows: unknown[][], previousCount: number, width: number): unknown[][] {
  const blanks = Array.from({ length: Math.max(0, previousCount - rows.length) }, () => Array<unknown>(width).fill(''));
  return [...rows, ...blanks];
}
