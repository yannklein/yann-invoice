import type { Slot } from './types';

/** Expected real return of the target mix: stock slots earn `rStocks`, bond slots `rBonds`. */
export function blendedReturn(slots: Pick<Slot, 'kind' | 'targetPct'>[], rStocks: number, rBonds: number): number {
  const total = slots.reduce((s, x) => s + x.targetPct, 0);
  if (!total) return 0;
  return slots.reduce((r, s) => r + (s.targetPct / total) * (s.kind === 'stocks' ? rStocks : rBonds), 0);
}

/** Value in today's euros after each horizon: start compounding per buy period, plus `perBuyEur` at the end of every period. */
export function project(
  o: { startEur: number; perBuyEur: number; buysPerYear: number; realReturn: number },
  years: number[],
): { years: number; valueEur: number }[] {
  const n = Math.max(1, Math.round(o.buysPerYear));
  const p = Math.pow(1 + o.realReturn, 1 / n) - 1;
  return years.map((y) => {
    const k = Math.round(y * n);
    const grown = o.startEur * Math.pow(1 + p, k);
    const contributions = p === 0 ? o.perBuyEur * k : (o.perBuyEur * (Math.pow(1 + p, k) - 1)) / p;
    return { years: y, valueEur: Math.round(grown + contributions) };
  });
}

/** Years until Yann is as old as Buffett (96), or null without a birth year or once past it. */
export function buffettHorizon(birthYear: number | null, today: string): number | null {
  if (!birthYear) return null;
  const years = 96 - (Number(today.slice(0, 4)) - birthYear);
  return years > 0 ? years : null;
}
