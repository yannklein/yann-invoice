import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMonthlyRates, parseMonthlyRates, rateFor } from '@/lib/fx/history';

describe('parseMonthlyRates', () => {
  it('averages each currency per month', () => {
    expect(parseMonthlyRates({
      rates: { '2026-09-29': { JPY: 170, USD: 1.1 }, '2026-09-30': { JPY: 172, USD: 1.2 }, '2026-10-01': { JPY: 175 } },
    })).toEqual({ '2026-09': { JPY: 171, USD: 1.15 }, '2026-10': { JPY: 175 } });
  });
  it('skips bad dates and non-positive or non-numeric rates', () => {
    expect(parseMonthlyRates({ rates: { nope: { JPY: 1 }, '2026-09-01': { JPY: 0, USD: 'x' }, '2026-09-02': { JPY: 171 } } }))
      .toEqual({ '2026-09': { JPY: 171 } });
  });
  it('returns {} for unusable responses', () => {
    for (const j of [null, 'x', {}, { rates: null }, { rates: 3 }]) expect(parseMonthlyRates(j)).toEqual({});
  });
});

describe('rateFor', () => {
  const rates = { '2026-07': { JPY: 168, USD: 1.1 }, '2026-09': { JPY: 171 } };
  it('uses the month itself', () => expect(rateFor(rates, '2026-09', 'JPY')).toBe(171));
  it('falls back to the closest earlier month that has the currency', () => {
    expect(rateFor(rates, '2026-10', 'JPY')).toBe(171);
    expect(rateFor(rates, '2026-09', 'USD')).toBe(1.1);
  });
  it('returns null before the first month', () => expect(rateFor(rates, '2026-06', 'JPY')).toBeNull());
});

describe('fetchMonthlyRates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the range and parses it', async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ rates: { '2026-10-01': { JPY: 175, USD: 1.17 } } })));
    vi.stubGlobal('fetch', f);
    expect(await fetchMonthlyRates('2025-01', '2026-10-12')).toEqual({ '2026-10': { JPY: 175, USD: 1.17 } });
    expect(f.mock.calls[0][0]).toBe('https://api.frankfurter.dev/v1/2025-01-01..2026-10-12?from=EUR&to=JPY,USD');
  });
  it('returns null when a 200 response has no usable rates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rates: {} }))));
    expect(await fetchMonthlyRates('2025-01', '2026-10-12')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>')));
    expect(await fetchMonthlyRates('2025-01', '2026-10-12')).toBeNull();
  });
  it('returns null on HTTP errors and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await fetchMonthlyRates('2025-01', '2026-10-12')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchMonthlyRates('2025-01', '2026-10-12')).toBeNull();
  });
});
