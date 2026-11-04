import { expenseBreakdown, transfers } from '@/lib/dashboard/household';
import type { Line, MonthRecord } from '@/lib/shared/types';
import { round2 } from './types';

const RESERVE_MONTHS = 6;
const SAMPLE_MONTHS = 12;

/** The cash to keep out of the market: `months` of average living costs, rounded up to the next €100. */
export interface SafeCash {
  monthlyEur: number;
  safeEur: number;
  months: number;
  /** How many saved months the average covers. */
  sampleMonths: number;
}

/**
 * Living costs are what still has to be paid if invoices stop: housing, subscriptions, other spending and the transfer to
 * the shared account. Taxes follow income and savings can pause, so neither counts.
 */
export function safeCash(months: MonthRecord[], lines: Line[]): SafeCash | null {
  const recent = [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-SAMPLE_MONTHS);
  if (!recent.length) return null;
  const spent = expenseBreakdown(recent, lines, 'EUR').reduce((s, m) => s + m.housing + m.subs + m.other, 0);
  const transferred = transfers(recent, lines, 'EUR').points.reduce((s, p) => s + p.amount, 0);
  const monthlyEur = Math.max(0, round2((spent + transferred) / recent.length));
  return { monthlyEur, safeEur: Math.ceil((monthlyEur * RESERVE_MONTHS) / 100) * 100, months: RESERVE_MONTHS, sampleMonths: recent.length };
}
