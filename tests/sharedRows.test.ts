import { describe, expect, it } from 'vitest';
import { lineToValues, monthToValues, padRows, replaceMonth, upsertMonth, valuesToLine, valuesToMonth } from '@/lib/shared/rows';
import type { Line, MonthRecord } from '@/lib/shared/types';

const line = (p: Partial<Line>): Line => ({
  month: '2026-09', kind: 'expense', label: 'x', amount: 1, currency: 'JPY', invoiceId: null, inst: null, note: '', ...p,
});

describe('line values', () => {
  it('round-trips plain, linked and instalment lines', () => {
    for (const l of [
      line({}),
      line({ kind: 'income', label: 'Matinno', amount: 404055, invoiceId: 'abc', note: 'paid 3rd' }),
      line({ label: 'Tax', amount: 866, currency: 'EUR', inst: { total: 2598, index: 2, count: 3 } }),
    ]) expect(valuesToLine(lineToValues(l))).toEqual(l);
  });
  it('accepts numbers as the Sheets API returns them (numbers or strings)', () => {
    expect(valuesToLine(['2026-09', 'expense', 'Gym', 50, 'EUR', '', 300, 1, 3, ''])).toEqual(
      line({ label: 'Gym', amount: 50, currency: 'EUR', inst: { total: 300, index: 1, count: 3 } }),
    );
  });
  it('rejects rows with a bad month, kind, currency or amount', () => {
    expect(valuesToLine(['2026-13', 'expense', 'x', '1', 'JPY'])).toBeNull();
    expect(valuesToLine(['2026-09', 'cost', 'x', '1', 'JPY'])).toBeNull();
    expect(valuesToLine(['2026-09', 'expense', 'x', '1', 'USD'])).toBeNull();
    expect(valuesToLine(['2026-09', 'expense', 'x', '', 'JPY'])).toBeNull();
    expect(valuesToLine([])).toBeNull();
  });
  it('drops an inconsistent instalment but keeps the line', () => {
    expect(valuesToLine(['2026-09', 'expense', 'Tax', '866', 'EUR', '', '2598', '4', '3', ''])?.inst).toBeNull();
    expect(valuesToLine(['2026-09', 'expense', 'Tax', '866', 'EUR', '', '2598', '', '3', ''])?.inst).toBeNull();
  });
});

describe('month values', () => {
  const m: MonthRecord = { month: '2026-10', fxJpyPerEur: 177.2, note: 'n', updatedAt: '2026-10-01T08:00:00.000Z' };
  it('round-trips', () => expect(valuesToMonth(monthToValues(m))).toEqual(m));
  it('rejects a missing rate', () => expect(valuesToMonth(['2026-10', '', '', ''])).toBeNull());
});

describe('replaceMonth', () => {
  const all = [line({ month: '2026-08', label: 'a' }), line({ month: '2026-09', label: 'b' }), line({ month: '2026-09', label: 'c' })];
  it('replaces only that month and keeps months sorted', () => {
    expect(replaceMonth(all, '2026-09', [line({ month: '2026-09', label: 'd' })]).map((l) => l.label)).toEqual(['a', 'd']);
    expect(replaceMonth(all, '2026-07', [line({ month: '2026-07', label: 'z' })]).map((l) => l.label)).toEqual(['z', 'a', 'b', 'c']);
  });
});

describe('upsertMonth', () => {
  const a: MonthRecord = { month: '2026-09', fxJpyPerEur: 185, note: '', updatedAt: 'x' };
  it('inserts sorted and replaces existing', () => {
    const b = { ...a, month: '2026-08' };
    expect(upsertMonth([a], b).map((m) => m.month)).toEqual(['2026-08', '2026-09']);
    expect(upsertMonth([a, b], { ...a, fxJpyPerEur: 1 }).find((m) => m.month === '2026-09')?.fxJpyPerEur).toBe(1);
  });
});

describe('padRows', () => {
  it('adds blank rows so a single update overwrites stale rows', () => {
    expect(padRows([['a', 'b']], 3, 2)).toEqual([['a', 'b'], ['', ''], ['', '']]);
    expect(padRows([['a', 'b']], 0, 2)).toEqual([['a', 'b']]);
  });
});
