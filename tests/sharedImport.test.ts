import { describe, expect, it } from 'vitest';
import { importLegacy, monthsForTabs, parseCell } from '@/lib/shared/importLegacy';
import { LEGACY_TABS } from './fixtures/sharedTabs';

const result = importLegacy(LEGACY_TABS, '2026-10');
const month = (m: string) => result.months.find((x) => x.month === m)!;
const find = (m: string, label: string) => month(m).lines.find((l) => l.label === label)!;

describe('monthsForTabs', () => {
  it('maps the last tab to the latest such month and walks back across the year', () => {
    expect(monthsForTabs(LEGACY_TABS.map((t) => t.name), '2026-10')).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
  });
  it('lets the last tab be the current month', () => {
    expect(monthsForTabs(['Sep 1st', 'Oct 1st'], '2026-10')).toEqual(['2026-09', '2026-10']);
  });
  it('skips tabs that are not month names (e.g. Months/Lines on re-import)', () => {
    expect(monthsForTabs(['Aug 1st', 'Months', 'Sep 1st', 'Lines'], '2026-10')).toEqual(['2026-08', null, '2026-09', null]);
  });
});

describe('parseCell', () => {
  it('reads I1 formulas as EUR and plain numbers as kJPY', () => {
    expect(parseCell('=5696.25*I1/1000', 1055.686013, 185.33)).toEqual({ amount: 5696.25, currency: 'EUR', inst: null, note: '' });
    expect(parseCell(404, 404, 185.33)).toEqual({ amount: 404000, currency: 'JPY', inst: null, note: '' });
  });
  it('reads inline-rate formulas as EUR', () => {
    expect(parseCell('= (34.2+25.59)*177/1000', 10.58283, 0)).toMatchObject({ amount: 59.79, currency: 'EUR', note: '= (34.2+25.59)*177/1000' });
  });
  it('detects total/N instalments', () => {
    expect(parseCell('=2598/3 * I1 /1000', 160.49578, 185.33)).toEqual({ amount: 866, currency: 'EUR', inst: { total: 2598, index: 1, count: 3 }, note: '' });
  });
  it('keeps non-trivial formulas as a note', () => {
    expect(parseCell('= 1000 * I1 /1000 /2', 92.1, 184.2)).toEqual({ amount: 500, currency: 'EUR', inst: null, note: '= 1000 * I1 /1000 /2' });
    expect(parseCell('=(200) * I1 /1000', 37.066, 185.33)!.note).toBe('');
  });
  it('accepts comma decimals in formulas', () => {
    expect(parseCell('=2598,5/3*I1/1000', 160.5266, 185.33)!.inst).toEqual({ total: 2598.5, index: 1, count: 3 });
  });
  it('returns null for zero, empty and text cells', () => {
    expect(parseCell('=0 *I1/1000', 0, 185.33)).toBeNull();
    expect(parseCell('', '', 185.33)).toBeNull();
    expect(parseCell('1266.56', '1266.56', 185.33)).toBeNull();
  });
});

describe('importLegacy (real tabs)', () => {
  it('imports all 12 months', () => {
    expect(result.months.map((m) => m.month)).toHaveLength(12);
    expect(result.skipped).toEqual([]);
  });
  it('matches every tab’s own F1 total', () => {
    for (const m of result.months) expect({ month: m.month, ok: m.ok, diff: m.actualKjpy - (m.expectedKjpy ?? NaN) }).toMatchObject({ month: m.month, ok: true });
  });
  it('reads Sep 2026 like the sheet', () => {
    const sep = month('2026-09');
    expect(sep.fx).toBe(185.33);
    expect(sep.actualKjpy).toBeCloseTo(808.43, 2);
    expect(find('2026-09', 'LWB')).toMatchObject({ kind: 'income', amount: 5696.25, currency: 'EUR' });
    expect(find('2026-09', 'Matinno')).toMatchObject({ kind: 'income', amount: 404000, currency: 'JPY' });
    expect(find('2026-09', 'Rental')).toMatchObject({ kind: 'expense', amount: 1195.61, currency: 'EUR', note: 'aug 15 to sep 15' });
    expect(find('2026-09', 'Savings')).toMatchObject({ kind: 'expense', amount: 200000, currency: 'JPY' });
    expect(find('2026-09', 'LWT')).toBeUndefined(); // 0 → skipped
  });
  it('numbers the tax instalment across consecutive months', () => {
    expect(find('2026-07', 'Tax 2nd semester').inst).toEqual({ total: 2598, index: 1, count: 3 });
    expect(find('2026-08', 'Tax 2nd semester').inst).toEqual({ total: 2598, index: 2, count: 3 });
    expect(find('2026-09', 'Tax 2nd semester').inst).toEqual({ total: 2598, index: 3, count: 3 });
  });
  it('uses the inline rate when I1 is empty (Nov 2025) and 177 when there is none (Oct 2025)', () => {
    expect(month('2025-11').fx).toBe(177);
    expect(find('2025-11', 'Spendings')).toMatchObject({ currency: 'EUR', amount: 277.85 });
    expect(month('2025-10').fx).toBe(177);
  });
  it('reads the half-rent formula (Apr 2026)', () => {
    expect(month('2026-04').lines.find((l) => l.amount === 500 && l.currency === 'EUR')).toBeTruthy();
  });
  it('never imports TOTAL rows or scratch columns', () => {
    for (const m of result.months) expect(m.lines.some((l) => /^total/i.test(l.label))).toBe(false);
  });
});
