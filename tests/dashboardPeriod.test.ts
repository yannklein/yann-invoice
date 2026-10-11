import { describe, expect, it } from 'vitest';
import { buildFx, convert } from '@/lib/dashboard/convert';
import { compactMoney, dayMonth, delayLabel, money, monthShort, percent, signedPercent } from '@/lib/dashboard/format';
import { monthDiff, parseCcy, parsePeriod, periodLabel, periodMonths, periodParam, taxYearOf, todayDate, yearOptions } from '@/lib/dashboard/period';
import { FX, monthRec } from './fixtures/dashboard';

describe('period', () => {
  it('parses p against the available years, defaulting to 12m', () => {
    expect(parsePeriod('2025', [2026, 2025])).toEqual({ kind: 'year', year: 2025 });
    expect(parsePeriod('2019', [2026, 2025])).toEqual({ kind: '12m' });
    expect(parsePeriod('abc', [2026])).toEqual({ kind: '12m' });
    expect(parsePeriod(undefined, [2026])).toEqual({ kind: '12m' });
  });
  it('parses ccy, defaulting to EUR', () => {
    expect(parseCcy('JPY')).toBe('JPY');
    expect(parseCcy('usd')).toBe('EUR');
    expect(parseCcy(undefined)).toBe('EUR');
  });
  it('lists the last 12 months across a year boundary', () => {
    const m = periodMonths({ kind: '12m' }, '2026-03');
    expect(m).toHaveLength(12);
    expect([m[0], m[11]]).toEqual(['2025-04', '2026-03']);
  });
  it('lists a calendar year', () => expect(periodMonths({ kind: 'year', year: 2025 }, '2026-10')).toEqual(
    ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'],
  ));
  it('offers years from the oldest invoice to now, newest first; only this year with no invoices', () => {
    expect(yearOptions('2024-11', '2026-10')).toEqual([2026, 2025, 2024]);
    expect(yearOptions(null, '2026-10')).toEqual([2026]);
  });
  it('labels and serialises periods', () => {
    expect([periodParam({ kind: '12m' }), periodLabel({ kind: '12m' })]).toEqual(['12m', 'Last 12 months']);
    expect([periodParam({ kind: 'year', year: 2025 }), periodLabel({ kind: 'year', year: 2025 })]).toEqual(['2025', '2025']);
  });
  it('picks the tax year', () => {
    expect(taxYearOf({ kind: '12m' }, '2026-10')).toBe(2026);
    expect(taxYearOf({ kind: 'year', year: 2025 }, '2026-10')).toBe(2025);
  });
  it('counts months between two months', () => {
    expect(monthDiff('2025-11', '2026-02')).toBe(3);
    expect(monthDiff('2026-02', '2026-01')).toBe(-1);
  });
  it('uses Barcelona time for today', () => expect(todayDate(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12'));
});

describe('convert', () => {
  it('converts through EUR at the month rate and rounds to the target currency', () => {
    expect(convert(100, 'EUR', 'JPY', '2026-09', FX)).toBe(16000);
    expect(convert(16000, 'JPY', 'EUR', '2026-09', FX)).toBe(100);
    expect(convert(120, 'USD', 'EUR', '2026-09', FX)).toBe(100);
    expect(convert(120, 'USD', 'JPY', '2026-09', FX)).toBe(16000);
    expect(convert(1, 'JPY', 'EUR', '2026-09', FX)).toBe(0.01);
  });
  it('uses the fixed fallbacks when no rate exists', () => {
    const none = { rates: {}, approximate: true };
    expect(convert(100, 'EUR', 'JPY', '2026-09', none)).toBe(17700);
    expect(convert(110, 'USD', 'EUR', '2026-09', none)).toBe(100);
  });
  it('builds approximate rates from the shared months when live rates are missing', () => {
    expect(buildFx(FX.rates, [])).toEqual({ rates: FX.rates, approximate: false });
    const fx = buildFx(null, [monthRec('2025-10', 170), monthRec('2025-11', 0)]);
    expect(fx).toEqual({ rates: { '2025-10': { JPY: 170 } }, approximate: true });
    expect(convert(100, 'EUR', 'JPY', '2026-03', fx)).toBe(17000);
    expect(convert(100, 'EUR', 'JPY', '2025-09', fx)).toBe(17700);
  });
});

describe('format', () => {
  it('formats money with and without cents', () => {
    expect(money(1234.5, 'EUR')).toBe('€1,235');
    expect(money(1234.5, 'EUR', true)).toBe('€1,234.50');
    expect(money(404055, 'JPY', true)).toBe('¥404,055');
    expect(money(-180000, 'JPY')).toBe('-¥180,000');
  });
  it('formats compact axis labels', () => {
    expect(compactMoney(48200, 'EUR')).toBe('€48.2K');
    expect(compactMoney(-180000, 'JPY')).toBe('-¥180K');
  });
  it('formats months, days, percentages and delays', () => {
    expect(monthShort('2026-10')).toBe('Oct 26');
    expect(dayMonth('2026-10-20')).toBe('20 Oct');
    expect(percent(0.624)).toBe('62%');
    expect(signedPercent(0.12)).toBe('+12%');
    expect(signedPercent(-0.05)).toBe('−5%');
    expect(delayLabel(0)).toBe('same month');
    expect(delayLabel(1)).toBe('+1 month');
    expect(delayLabel(1.5)).toBe('+1.5 months');
  });
});
