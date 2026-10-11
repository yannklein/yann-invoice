export type RateCurrency = 'JPY' | 'USD';
/** Average ECB rate per month (YYYY-MM), in units per EUR. A month may lack a currency. */
export type MonthlyRates = Record<string, Partial<Record<RateCurrency, number>>>;

const CURRENCIES: RateCurrency[] = ['JPY', 'USD'];

/** Frankfurter time series (`{ rates: { 'YYYY-MM-DD': { JPY, USD } } }`) → monthly averages. Unusable input gives {}. */
export function parseMonthlyRates(json: unknown): MonthlyRates {
  const daily = (json as { rates?: unknown } | null)?.rates;
  if (!daily || typeof daily !== 'object') return {};
  const acc = new Map<string, { sum: number; n: number }>();
  for (const [date, day] of Object.entries(daily as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object') continue;
    for (const c of CURRENCIES) {
      const v = (day as Record<string, unknown>)[c];
      if (typeof v !== 'number' || !(v > 0)) continue;
      const key = `${date.slice(0, 7)}|${c}`;
      const a = acc.get(key) ?? { sum: 0, n: 0 };
      acc.set(key, { sum: a.sum + v, n: a.n + 1 });
    }
  }
  const out: MonthlyRates = {};
  for (const [key, { sum, n }] of acc) {
    const [month, c] = key.split('|') as [string, RateCurrency];
    (out[month] ??= {})[c] = Math.round((sum / n) * 1e4) / 1e4;
  }
  return out;
}

/** The month's rate, else the closest earlier month's, else null. */
export function rateFor(rates: MonthlyRates, month: string, c: RateCurrency): number | null {
  const exact = rates[month]?.[c];
  if (exact) return exact;
  const earlier = Object.keys(rates).filter((m) => m < month && rates[m][c]).sort().at(-1);
  return earlier ? rates[earlier][c]! : null;
}

/** Monthly EUR→JPY/USD averages from `fromMonth` to `toDate` (YYYY-MM-DD), or null when they cannot be fetched. Cached a day. */
export async function fetchMonthlyRates(fromMonth: string, toDate: string): Promise<MonthlyRates | null> {
  try {
    const url = `https://api.frankfurter.dev/v1/${fromMonth}-01..${toDate}?from=EUR&to=JPY,USD`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const rates = parseMonthlyRates(await res.json());
    return Object.keys(rates).length ? rates : null;
  } catch {
    return null;
  }
}
