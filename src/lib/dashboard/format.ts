import type { Currency } from '@/lib/invoice/types';

/** Whole units by default (dashboards); `cents` shows EUR/USD minor units (tax figures, invoice totals). */
export function money(x: number, c: Currency, cents = false): string {
  const digits = cents && c !== 'JPY' ? 2 : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

/** Axis ticks: €48.2K, ¥1.3M. */
export const compactMoney = (x: number, c: Currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(x);

/** 2026-10 → "Oct 26". */
export const monthShort = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** 2026-10-20 → "20 Oct". */
export const dayMonth = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const percent = (x: number) => `${Math.round(x * 100)}%`;

export const signedPercent = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

export const delayLabel = (months: number) => (months === 0 ? 'same month' : `+${months} month${months === 1 ? '' : 's'}`);
