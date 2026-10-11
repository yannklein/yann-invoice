import { roundMoney } from '@/lib/invoice/totals';
import { addMonths, toJpy } from './model';
import type { Instalment, Line, LineCurrency } from './types';

/** One legacy "Sep 1st"-style tab, read twice from A1:I: with formulas and with unformatted values. */
export interface LegacyTab {
  name: string;
  formulas: unknown[][];
  values: unknown[][];
}

export interface ImportedMonth {
  tab: string;
  month: string;
  fx: number;
  lines: Line[];
  expectedKjpy: number | null; // the tab's own F1
  actualKjpy: number;
  ok: boolean;
}

export interface ImportResult {
  months: ImportedMonth[];
  skipped: string[]; // tab names that are not months
}

const DEFAULT_FX = 177; // the rate the sheet used for its EUR total
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const toNum = (s: string) => Number(s.replace(',', '.'));
const RATE_INLINE = new RegExp(String.raw`\*\s*(${NUM})\s*\/\s*1000\s*$`);
const INSTALMENT = new RegExp(String.raw`^=\s*\(?\s*(${NUM})\s*\/\s*(\d+)\s*\)?\s*\*`);
const SIMPLE = new RegExp(String.raw`^=\s*\(?\s*${NUM}\s*\)?\s*\*\s*(?:I1|${NUM})\s*\/\s*1000\s*$`);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const str = (x: unknown) => String(x ?? '').trim();
const numeric = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function monthIndex(tabName: string): number | null {
  const word = tabName.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const i = MONTHS.findIndex((m) => word.startsWith(m) && word.length <= 9);
  return i < 0 ? null : i + 1;
}

/** Tab names → YYYY-MM. The last month tab is the latest such month ≤ current; earlier tabs count backwards. */
export function monthsForTabs(names: string[], current: string): (string | null)[] {
  const out: (string | null)[] = names.map(() => null);
  let bound = current; // the month found must be ≤ bound
  for (let i = names.length - 1; i >= 0; i--) {
    const target = monthIndex(names[i]);
    if (!target) continue;
    let m = bound;
    while (Number(m.slice(5)) !== target) m = addMonths(m, -1);
    out[i] = m;
    bound = addMonths(m, -1);
  }
  return out;
}

export interface ParsedCell {
  amount: number;
  currency: LineCurrency;
  inst: Instalment | null;
  note: string;
}

/** One B/C cell → amount in its original currency. EUR cells are formulas `… * I1 / 1000` (or an inline rate); plain numbers are kJPY. */
export function parseCell(formula: unknown, value: unknown, fx: number): ParsedCell | null {
  const v = numeric(value);
  if (v == null || v === 0) return null;
  const f = typeof formula === 'string' && formula.startsWith('=') ? formula : '';
  const rate = /\bI1\b/.test(f) ? fx : f.match(RATE_INLINE) ? toNum(f.match(RATE_INLINE)![1]) : null;
  if (!rate || rate <= 0) return { amount: roundMoney(v * 1000, 'JPY'), currency: 'JPY', inst: null, note: f && !SIMPLE.test(f) ? f : '' };
  const im = f.match(INSTALMENT);
  const inst = im && Number(im[2]) >= 2 ? { total: toNum(im[1]), index: 1, count: Number(im[2]) } : null;
  return { amount: roundMoney((v * 1000) / rate, 'EUR'), currency: 'EUR', inst, note: inst || SIMPLE.test(f) ? '' : f };
}

function tabFx(tab: LegacyTab): number {
  const i1 = numeric(tab.values[0]?.[8]);
  if (i1 && i1 > 0) return i1;
  for (const row of tab.formulas) {
    for (const c of row) {
      const m = typeof c === 'string' && !/\bI1\b/.test(c) ? c.match(RATE_INLINE) : null;
      if (m) return toNum(m[1]);
    }
  }
  return DEFAULT_FX;
}

function importTab(tab: LegacyTab, month: string): ImportedMonth {
  const fx = tabFx(tab);
  const lines: Line[] = [];
  for (let r = 1; r < tab.values.length; r++) {
    const label = str(tab.values[r]?.[0]);
    if (/^total/i.test(label)) continue;
    const comment = str(tab.values[r]?.[3]);
    for (const [col, kind] of [[1, 'income'], [2, 'expense']] as const) {
      const cell = parseCell(tab.formulas[r]?.[col], tab.values[r]?.[col], fx);
      if (!cell) continue;
      const note = [comment, cell.note].filter(Boolean).join(' · ');
      lines.push({ month, kind, label: label || '(no label)', amount: cell.amount, currency: cell.currency, invoiceId: null, inst: cell.inst, note });
    }
  }
  const signed = lines.reduce((s, l) => s + (l.kind === 'income' ? 1 : -1) * toJpy(l, fx), 0);
  const actualKjpy = signed / 1000;
  const expectedKjpy = numeric(tab.values[0]?.[5]);
  return { tab: tab.name, month, fx, lines, expectedKjpy, actualKjpy, ok: expectedKjpy != null && Math.abs(actualKjpy - expectedKjpy) < 0.01 };
}

/** Same label and total in the previous month → next instalment number. */
function numberInstalments(months: ImportedMonth[]) {
  for (let i = 1; i < months.length; i++) {
    if (months[i].month !== addMonths(months[i - 1].month, 1)) continue;
    for (const l of months[i].lines) {
      const prev = months[i - 1].lines.find((p) => p.inst && l.inst && p.label === l.label && p.inst.total === l.inst.total && p.inst.count === l.inst.count);
      if (l.inst && prev?.inst) l.inst.index = Math.min(prev.inst.index + 1, l.inst.count);
    }
  }
}

export function importLegacy(tabs: LegacyTab[], currentMonth: string): ImportResult {
  const assigned = monthsForTabs(tabs.map((t) => t.name), currentMonth);
  const months = tabs
    .map((t, i) => (assigned[i] ? importTab(t, assigned[i]) : null))
    .filter((m): m is ImportedMonth => m !== null)
    .sort((a, b) => a.month.localeCompare(b.month));
  numberInstalments(months);
  return { months, skipped: tabs.filter((_, i) => !assigned[i]).map((t) => t.name) };
}
