import { addMonths } from '@/lib/shared/model';

export type DisplayCurrency = 'EUR' | 'JPY';
export type Period = { kind: '12m' } | { kind: 'year'; year: number };

export const parseCcy = (c?: string): DisplayCurrency => (c === 'JPY' ? 'JPY' : 'EUR');

/** `?p=` → a period. A year is accepted only when it is one of `years`. */
export function parsePeriod(p: string | undefined, years: number[]): Period {
  const y = p && /^\d{4}$/.test(p) ? Number(p) : NaN;
  return years.includes(y) ? { kind: 'year', year: y } : { kind: '12m' };
}

export const periodParam = (p: Period) => (p.kind === '12m' ? '12m' : String(p.year));
export const periodLabel = (p: Period) => (p.kind === '12m' ? 'Last 12 months' : String(p.year));

/** The 12 months of a period: the 12 ending with `now`, or January–December. */
export function periodMonths(p: Period, now: string): string[] {
  const first = p.kind === '12m' ? addMonths(now, -11) : `${p.year}-01`;
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

/** Calendar years from the oldest invoice to now, newest first. */
export function yearOptions(oldestMonth: string | null, now: string): number[] {
  const last = Number(now.slice(0, 4));
  const first = oldestMonth ? Math.min(Number(oldestMonth.slice(0, 4)), last) : last;
  return Array.from({ length: last - first + 1 }, (_, i) => last - i);
}

/** Tax is filed per calendar year: the selected year, or this year for "Last 12 months". */
export const taxYearOf = (p: Period, now: string) => (p.kind === 'year' ? p.year : Number(now.slice(0, 4)));

/** Whole months from `from` to `to` (YYYY-MM); negative when `to` is earlier. */
export function monthDiff(from: string, to: string): number {
  const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return n(to) - n(from);
}

/** Today in Barcelona, YYYY-MM-DD. */
export const todayDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
