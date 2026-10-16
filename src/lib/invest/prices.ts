export interface PricePoint {
  date: string;
  close: number;
  /** Dividend-adjusted close (total return); equals close when Yahoo has none. */
  adj: number;
}

/** Daily prices in the listing currency, ascending, without gaps of null values. */
export interface PriceSeries {
  yahoo: string;
  currency: string;
  points: PricePoint[];
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

/** Yahoo v8 chart JSON → price series (dates in the exchange's local day), or null when it holds no usable points. */
export function parseYahooChart(json: unknown): PriceSeries | null {
  const r = (json as { chart?: { result?: unknown[] | null } } | null)?.chart?.result?.[0] as
    | { meta?: { symbol?: string; currency?: string; gmtoffset?: number }; timestamp?: number[]; indicators?: { quote?: { close?: unknown[] }[]; adjclose?: { adjclose?: unknown[] }[] } }
    | undefined;
  const ts = r?.timestamp ?? [];
  const close = r?.indicators?.quote?.[0]?.close ?? [];
  const adj = r?.indicators?.adjclose?.[0]?.adjclose;
  const offset = r?.meta?.gmtoffset ?? 0;
  const points: PricePoint[] = [];
  ts.forEach((t, i) => {
    const c = num(close[i]);
    if (c === null) return;
    const date = new Date((t + offset) * 1000).toISOString().slice(0, 10);
    points.push({ date, close: c, adj: num(adj?.[i]) ?? c });
  });
  if (!points.length || !r?.meta?.symbol) return null;
  return { yahoo: r.meta.symbol, currency: r.meta.currency ?? '', points };
}

/** The last close (or adjusted close) on or before `date`, else null. */
export function priceOn(s: PriceSeries | null | undefined, date: string, field: 'close' | 'adj' = 'close'): number | null {
  if (!s) return null;
  let found: number | null = null;
  for (const p of s.points) {
    if (p.date > date) break;
    found = p[field];
  }
  return found;
}

const seconds = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;

/** Daily prices from `from` to `to` inclusive (YYYY-MM-DD), or null when Yahoo fails. Cached a day. */
export async function fetchSeries(yahoo: string, from: string, to: string): Promise<PriceSeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?period1=${seconds(from)}&period2=${seconds(to) + 86400}&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
}
