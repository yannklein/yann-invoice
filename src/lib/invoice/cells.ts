import type { Currency } from './types';

export type Grid = string[][];
export const A = 0, B = 1, C = 2, D = 3, E = 4, F = 5;
const COLS = 6;

export function normalizeGrid(values: unknown[][] | null | undefined): Grid {
  return (values ?? []).map((row) =>
    Array.from({ length: COLS }, (_, i) => String(row?.[i] ?? '').trim()),
  );
}

export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parsePercent(s: string): number | null {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return Math.round(Number(m[1]) * 1e4) / 1e6;
}

export function parseDate(s: string): string | null {
  const m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function currencyOf(s: string): Currency | null {
  if (/[¥￥]|JPY/.test(s)) return 'JPY';
  if (/€|EUR/.test(s)) return 'EUR';
  if (/\$|USD/.test(s)) return 'USD';
  return null;
}

export function lastNonEmptyRow(grid: Grid, col: number): number {
  for (let r = grid.length - 1; r >= 0; r--) if (grid[r][col]) return r;
  return -1;
}
