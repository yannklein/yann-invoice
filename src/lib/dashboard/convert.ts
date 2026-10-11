import { rateFor, type MonthlyRates, type RateCurrency } from '@/lib/fx/history';
import { roundMoney } from '@/lib/invoice/totals';
import type { Currency } from '@/lib/invoice/types';
import type { MonthRecord } from '@/lib/shared/types';

/** Used when no monthly rate exists at or before a month (same JPY default as /shared). */
export const FALLBACK_PER_EUR: Record<RateCurrency, number> = { JPY: 177, USD: 1.1 };

export interface Fx {
  rates: MonthlyRates;
  approximate: boolean; // true when live ECB rates could not be fetched
}

/** Live monthly rates, or (when they could not be fetched) each shared month's saved JPY rate, flagged approximate. */
export function buildFx(live: MonthlyRates | null, sharedMonths: MonthRecord[]): Fx {
  if (live) return { rates: live, approximate: false };
  const rates: MonthlyRates = {};
  for (const m of sharedMonths) if (m.fxJpyPerEur > 0) rates[m.month] = { JPY: m.fxJpyPerEur };
  return { rates, approximate: true };
}

export const perEur = (fx: Fx, c: Currency, month: string): number =>
  c === 'EUR' ? 1 : rateFor(fx.rates, month, c) ?? FALLBACK_PER_EUR[c];

/** `amount` in `from` → `to`, both at `month`'s rate (through EUR), rounded to `to`'s minor unit. */
export function convert(amount: number, from: Currency, to: Currency, month: string, fx: Fx): number {
  if (from === to) return roundMoney(amount, to);
  return roundMoney((amount / perEur(fx, from, month)) * perEur(fx, to, month), to);
}
