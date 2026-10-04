import { describe, expect, it } from 'vitest';
import { normalizeGrid, parseMoney, parsePercent, parseDate, currencyOf, lastNonEmptyRow } from '@/lib/invoice/cells';

describe('cells', () => {
  it('normalizes ragged rows to 6 trimmed string columns', () => {
    expect(normalizeGrid([['a', ' b '], [], [1, 2, 3, 4, 5, 6, 7]])).toEqual([
      ['a', 'b', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['1', '2', '3', '4', '5', '6'],
    ]);
    expect(normalizeGrid(undefined)).toEqual([]);
  });

  it('parses money in any of the historical formats', () => {
    expect(parseMoney('€1,500.00')).toBe(1500);
    expect(parseMoney('¥450,000')).toBe(450000);
    expect(parseMoney('USD$0')).toBe(0);
    expect(parseMoney('1.00')).toBe(1);
    expect(parseMoney('N/A')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('parses percentages as fractions', () => {
    expect(parsePercent('10.21%')).toBe(0.1021);
    expect(parsePercent('0.00%')).toBe(0);
    expect(parsePercent('IRPF (7%)')).toBe(0.07);
    expect(parsePercent('N/A')).toBeNull();
    expect(parsePercent('¥0')).toBeNull();
  });

  it('parses slash and dash dates', () => {
    expect(parseDate('2026/09/17')).toBe('2026-09-17');
    expect(parseDate('2026-9-7')).toBe('2026-09-07');
    expect(parseDate('Sep 17')).toBeNull();
  });

  it('detects currency from symbols', () => {
    expect(currencyOf('¥10,000')).toBe('JPY');
    expect(currencyOf('€75.00')).toBe('EUR');
    expect(currencyOf('USD$0')).toBe('USD');
    expect(currencyOf('1.00')).toBeNull();
  });

  it('finds the last non-empty row in a column', () => {
    expect(lastNonEmptyRow([['a'], [''], ['b'], ['']].map((r) => [...r, '', '', '', '', '']), 0)).toBe(2);
    expect(lastNonEmptyRow([], 0)).toBe(-1);
  });
});
