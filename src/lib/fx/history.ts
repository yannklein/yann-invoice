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

/** ECB rate per day (YYYY-MM-DD), in units per EUR. Weekends and holidays are missing. */
export type DailyRates = Record<string, Partial<Record<RateCurrency, number>>>;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Frankfurter time series → the valid days and positive rates only. Unusable input gives {}. */
export function parseDailyRates(json: unknown): DailyRates {
  const daily = (json as { rates?: unknown } | null)?.rates;
  if (!daily || typeof daily !== 'object') return {};
  const out: DailyRates = {};
  for (const [date, day] of Object.entries(daily as Record<string, unknown>)) {
    if (!DAY_RE.test(date) || !day || typeof day !== 'object') continue;
    for (const c of CURRENCIES) {
      const v = (day as Record<string, unknown>)[c];
      if (typeof v === 'number' && v > 0) (out[date] ??= {})[c] = v;
    }
  }
  return out;
}

/** The day's rate, else the closest earlier day's, else null. */
export function dailyRateFor(rates: DailyRates, date: string, c: RateCurrency): number | null {
  const exact = rates[date]?.[c];
  if (exact) return exact;
  const earlier = Object.keys(rates).filter((d) => d < date && rates[d][c]).sort().at(-1);
  return earlier ? rates[earlier][c]! : null;
}

/** Amount in EUR at the ECB rate of `date`, rounded to cents; EUR passes through. Null when no rate is known. */
export function toEur(amount: number, currency: 'EUR' | RateCurrency, date: string, rates: DailyRates | null): number | null {
  if (currency === 'EUR') return amount;
  const rate = rates ? dailyRateFor(rates, date, currency) : null;
  return rate ? Math.round((amount / rate) * 100) / 100 : null;
}

/** Daily EUR→JPY/USD rates from `from` to `to` (YYYY-MM-DD), or null when they cannot be fetched. Cached a day. */
export async function fetchDailyRates(from: string, to: string): Promise<DailyRates | null> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${from}..${to}?from=EUR&to=JPY,USD`, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const rates = parseDailyRates(await res.json());
    return Object.keys(rates).length ? rates : null;
  } catch {
    return null;
  }
}
