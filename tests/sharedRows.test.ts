import { describe, expect, it } from 'vitest';
import { lineToValues, monthToValues, padRows, replaceMonthRows, valuesToLine, valuesToMonth } from '@/lib/shared/rows';
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

describe('replaceMonthRows', () => {
  const all = [['2026-08', 'a'], ['2026-09', 'b'], ['garbage', 'kept'], ['2026-09', 'c']];
  it('replaces only that month, keeps months sorted and unparseable rows untouched', () => {
    expect(replaceMonthRows(all, '2026-09', [['2026-09', 'd']])).toEqual([['2026-08', 'a'], ['2026-09', 'd'], ['garbage', 'kept']]);
    expect(replaceMonthRows(all, '2026-07', [['2026-07', 'z']]).map((r) => r[1])).toEqual(['z', 'a', 'b', 'c', 'kept']);
  });
  it('treats Sheets numbers and strings in column A alike', () => {
    expect(replaceMonthRows([[' 2026-09 ', 'old']], '2026-09', [])).toEqual([]);
  });
});

describe('padRows', () => {
  it('adds blank rows so a single update overwrites stale rows', () => {
    expect(padRows([['a', 'b']], 3, 2)).toEqual([['a', 'b'], ['', ''], ['', '']]);
    expect(padRows([['a', 'b']], 0, 2)).toEqual([['a', 'b']]);
  });
});
