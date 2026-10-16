import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSeries, parseYahooChart, priceOn } from '@/lib/invest/prices';

const fixture = JSON.parse(readFileSync('tests/fixtures/yahoo-chart.json', 'utf8'));

describe('parseYahooChart', () => {
  it('reads closes and adjusted closes per local day, dropping null days', () => {
    const s = parseYahooChart(fixture)!;
    expect(s.yahoo).toBe('CSBGE3.SW');
    expect(s.currency).toBe('EUR');
    expect(s.points.map((p) => p.date)).toEqual(['2025-10-01', '2025-10-03']);
    expect(s.points[0].close).toBeCloseTo(115.395, 3);
    expect(s.points[1].adj).toBeCloseTo(115.42, 3);
  });
  it('uses close as adj when adjclose is missing', () => {
    const j = structuredClone(fixture);
    delete j.chart.result[0].indicators.adjclose;
    const s = parseYahooChart(j)!;
    expect(s.points[0].adj).toBe(s.points[0].close);
  });
  it('returns null for unusable bodies', () => {
    for (const j of [null, {}, { chart: { result: null, error: { code: 'Not Found' } } }, { chart: { result: [{ meta: {}, timestamp: [] }] } }]) {
      expect(parseYahooChart(j)).toBeNull();
    }
  });
});

describe('priceOn', () => {
  const s = parseYahooChart(fixture)!;
  it('takes the last point on or before the date', () => {
    expect(priceOn(s, '2025-10-02')).toBeCloseTo(115.395, 3);
    expect(priceOn(s, '2026-01-01')).toBeCloseTo(115.42, 3);
    expect(priceOn(s, '2026-01-01', 'adj')).toBeCloseTo(115.42, 3);
  });
  it('returns null before the first point or without a series', () => {
    expect(priceOn(s, '2025-09-30')).toBeNull();
    expect(priceOn(null, '2025-10-02')).toBeNull();
  });
});

describe('fetchSeries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the daily range with a browser user agent', async () => {
    const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', f);
    const s = await fetchSeries('CSBGE3.SW', '2025-10-01', '2025-10-03');
    expect(s?.points).toHaveLength(2);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://query1.finance.yahoo.com/v8/finance/chart/CSBGE3.SW?period1=${Date.parse('2025-10-01T00:00:00Z') / 1000}&period2=${Date.parse('2025-10-04T00:00:00Z') / 1000}&interval=1d`);
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0');
  });
  it('returns null on HTTP errors and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await fetchSeries('NOPE.XX', '2025-10-01', '2025-10-03')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchSeries('NOPE.XX', '2025-10-01', '2025-10-03')).toBeNull();
  });
});
