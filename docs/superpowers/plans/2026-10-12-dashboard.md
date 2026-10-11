# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/dashboard` page with Business, Tax and Household charts built from the Invoice Index and the Shared account tabs.

**Architecture:** The server page loads the invoice index, the shared tabs and monthly ECB rates (one Frankfurter time-series call), then calls pure, unit-tested functions in `src/lib/dashboard/` that return plain chart data. Thin client components in `src/app/dashboard/charts/` draw that data with the shadcn Chart component (Recharts). Period (`?p=`) and currency (`?ccy=`) are URL params changed by links, as sorting is on the invoice list.

**Tech Stack:** Next.js 16.3.8 (App Router, server components), React 19.2.8, TypeScript, Tailwind v4, shadcn (`base-nova` style), Recharts 3.8.0 (via `npx shadcn add chart`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-dashboard-design.md`

## Global Constraints

- **Next.js 16 is not the version you know.** Before writing Next-specific code (pages, `fetch` caching, links), read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`). Existing pages show the patterns in use: `searchParams: Promise<…>` awaited in the page, `fetch(url, { next: { revalidate } })`.
- **One new dependency only:** `recharts@3.8.0`, added by `npx shadcn add chart`. No other packages.
- **Pure modules** (`src/lib/fx/history.ts`, `src/lib/dashboard/*.ts`) never import Google, Next or React. Every pure module gets a Vitest file in `tests/` (`tests/**/*.test.ts`, alias `@` → `src`).
- **Invoice month** = `invoiceMonth(row)` from `src/lib/shared/model.ts`. **Revenue** = `invoice.subtotal`. **Unpaid amounts** = `invoice.total`.
- **Unpaid tracking starts at `2025-07`** (`UNPAID_FROM`). Only JPY and EUR invoices are tracked.
- **Rates:** `https://api.frankfurter.dev/v1/{fromMonth}-01..{today}?from=EUR&to=JPY,USD`, 5 s timeout, `next: { revalidate: 86400 }`. Fallback per EUR: JPY 177, USD 1.1.
- **The Tax section is always in EUR**, whatever `ccy` says.
- **The app is dark-only** (`<html className="dark">`). Chart colours come from CSS tokens, never hex in components:
  - `--chart-1 #1f9e94`, `--chart-2 #c08a1e`, `--chart-3 #4a8fe0`, `--chart-4 #e0608d`, `--chart-5 #8a80e8`
  - `--chart-other #7c7b78`, `--chart-muted rgb(240 237 232 / 0.35)`, `--chart-gap #12141c`
- **Chart rules** (dataviz):
  - Never use a second y-axis.
  - Bars are ≤ 24px wide (`maxBarSize={24}`) with a 4px rounded top on the topmost segment.
  - Stacked segments are separated by a 2px `--chart-gap` stroke. Lines are 2px.
  - Text never uses a series colour.
  - Any chart with two or more series has a legend.
- **Copy, verbatim:**
  - "Exchange rates unavailable — converted amounts are approximate."
  - "Nothing in this period"
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A brand-new account with no invoices:** the page must still render, with empty states, and the year selector must offer only the current year. No crash on `rows.map(...)[0]`. *(Tests in Task 2 `yearOptions(null, …)` and Task 3 `revenueByMonth([] …)`.)*
2. **An invoice numbered in a future month** (e.g. `202612001` in Oct 2026) must appear as unpaid with age 0, never a negative age. *(Test in Task 3 `unpaid`.)*
3. **A shared month saved with a rate of 0 or blank** must fall back to 177 in Household. It must never show `NaN`/`Infinity` bars. *(Test in Task 5 `transfers`.)*
4. **An income line linked to an invoice that is no longer in the index** (sheet deleted) must be ignored by payment delay and unpaid, not crash. *(Test in Task 3 `paymentDelay`.)*
5. **The rate service answering 200 with an empty or malformed body** must count as "unavailable", so the approximate-rates banner shows instead of silently using fallbacks. *(Test in Task 1 `fetchMonthlyRates`.)*

---

### Task 1: Monthly ECB rates

**Files:**
- Create: `src/lib/fx/history.ts`
- Test: `tests/fxHistory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RateCurrency = 'JPY' | 'USD'`
  - `type MonthlyRates = Record<string /*YYYY-MM*/, Partial<Record<RateCurrency, number>>>` (units per EUR)
  - `parseMonthlyRates(json: unknown): MonthlyRates`
  - `rateFor(rates: MonthlyRates, month: string, c: RateCurrency): number | null`
  - `fetchMonthlyRates(fromMonth: string, toDate: string): Promise<MonthlyRates | null>`

- [ ] **Step 1: Write the failing tests**

`tests/fxHistory.test.ts`:

```ts
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
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ rates: { '2026-10-01': { JPY: 175, USD: 1.17 } } })));
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fxHistory.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/fx/history"".

- [ ] **Step 3: Implement**

`src/lib/fx/history.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/fxHistory.test.ts`
Expected: PASS (9 tests). If `next` in the `fetch` init is a TypeScript error, check `node_modules/next/dist/docs/` for how `src/lib/shared/fx.ts` gets away with it (it uses the same option). Don't remove the option.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx/history.ts tests/fxHistory.test.ts
git commit -m "feat(dashboard): monthly ECB rates from one Frankfurter time-series call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Period, conversion and formatting

**Files:**
- Create: `src/lib/dashboard/period.ts`, `src/lib/dashboard/convert.ts`, `src/lib/dashboard/format.ts`
- Create: `tests/fixtures/dashboard.ts` (factories shared by Tasks 2, 3, 5, 7)
- Test: `tests/dashboardPeriod.test.ts`

**Interfaces:**
- Consumes:
  - `addMonths(month, n)` from `@/lib/shared/model`
  - `rateFor`, `MonthlyRates`, `RateCurrency` from Task 1
  - `roundMoney(x, currency)` from `@/lib/invoice/totals`
  - `Currency` from `@/lib/invoice/types`
  - `MonthRecord` from `@/lib/shared/types`
- Produces:
  - `period.ts`:
    - `type DisplayCurrency = 'EUR' | 'JPY'`
    - `type Period = { kind: '12m' } | { kind: 'year'; year: number }`
    - `parseCcy(c?: string): DisplayCurrency`
    - `parsePeriod(p: string | undefined, years: number[]): Period`
    - `periodParam(p: Period): string`
    - `periodLabel(p: Period): string`
    - `periodMonths(p: Period, now: string): string[]` (always 12 months)
    - `yearOptions(oldestMonth: string | null, now: string): number[]` (newest first)
    - `taxYearOf(p: Period, now: string): number`
    - `monthDiff(from: string, to: string): number`
    - `todayDate(now?: Date): string` (YYYY-MM-DD, Barcelona time)
  - `convert.ts`:
    - `FALLBACK_PER_EUR: Record<RateCurrency, number>`
    - `interface Fx { rates: MonthlyRates; approximate: boolean }`
    - `buildFx(live: MonthlyRates | null, sharedMonths: MonthRecord[]): Fx`
    - `perEur(fx: Fx, c: Currency, month: string): number`
    - `convert(amount: number, from: Currency, to: Currency, month: string, fx: Fx): number`
  - `format.ts`:
    - `money(x: number, c: Currency, cents?: boolean): string`
    - `compactMoney(x: number, c: Currency): string`
    - `monthShort(m: string): string`
    - `dayMonth(date: string): string`
    - `percent(x: number): string`
    - `signedPercent(x: number): string`
    - `delayLabel(months: number): string`
  - `tests/fixtures/dashboard.ts`:
    - `inv(fileId, p?)`
    - `line(p)`
    - `monthRec(month, fx?)`
    - `FX` (JPY 160 and USD 1.2 per EUR, from 2024-01 onward)

- [ ] **Step 1: Write the fixtures and the failing tests**

`tests/fixtures/dashboard.ts`:

```ts
import type { Fx } from '@/lib/dashboard/convert';
import type { IndexRow } from '@/lib/invoice/derive';
import type { ParsedInvoice } from '@/lib/invoice/types';
import type { Line, MonthRecord } from '@/lib/shared/types';

/** An index row. Defaults: EUR, ES, client ACME, subtotal = total = 100, no taxes. Set `number` to place it in a month. */
export const inv = (fileId: string, p: Partial<ParsedInvoice> & { meta?: IndexRow['meta'] } = {}): IndexRow => {
  const { meta = {}, ...invoice } = p;
  return {
    fileId,
    title: `Invoice ${fileId}`,
    modifiedTime: '2026-10-04T10:00:00.000Z',
    meta,
    invoice: {
      number: null, title: `Invoice ${fileId}`, issueDate: null, terms: null, senderLines: [], clientName: 'ACME', clientLines: ['ACME'],
      country: 'ES', currency: 'EUR', items: [], subtotal: 100, irpfRate: 0, vatRate: 0, withholdingRate: 0, total: 100, notes: [], bankLines: [],
      ...invoice,
    },
  };
};

export const line = (p: Partial<Line>): Line => ({
  month: '2026-09', kind: 'expense', label: 'x', amount: 0, currency: 'JPY', invoiceId: null, inst: null, note: '', ...p,
});

export const monthRec = (month: string, fxJpyPerEur = 160): MonthRecord => ({ month, fxJpyPerEur, note: '', updatedAt: '2026-10-01T00:00:00.000Z' });

/** 160 JPY and 1.2 USD per EUR in every month from 2024-01 (rateFor falls back to the earlier month). */
export const FX: Fx = { rates: { '2024-01': { JPY: 160, USD: 1.2 } }, approximate: false };
```

`tests/dashboardPeriod.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboardPeriod.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/dashboard/convert"".

- [ ] **Step 3: Implement the three modules**

`src/lib/dashboard/period.ts`:

```ts
import { addMonths } from '@/lib/shared/model';

export type DisplayCurrency = 'EUR' | 'JPY';
export type Period = { kind: '12m' } | { kind: 'year'; year: number };

export const parseCcy = (c?: string): DisplayCurrency => (c === 'JPY' ? 'JPY' : 'EUR');

/** `?p=` → a period. A year is accepted only when it is one of `years`. */
export function parsePeriod(p: string | undefined, years: number[]): Period {
  const y = p && /^\d{4}$/.test(p) ? Number(p) : NaN;
  return years.includes(y) ? { kind: 'year', year: y } : { kind: '12m' };
}

export const periodParam = (p: Period) => (p.kind === '12m' ? '12m' : String(p.year));
export const periodLabel = (p: Period) => (p.kind === '12m' ? 'Last 12 months' : String(p.year));

/** The 12 months of a period: the 12 ending with `now`, or January–December. */
export function periodMonths(p: Period, now: string): string[] {
  const first = p.kind === '12m' ? addMonths(now, -11) : `${p.year}-01`;
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

/** Calendar years from the oldest invoice to now, newest first. */
export function yearOptions(oldestMonth: string | null, now: string): number[] {
  const last = Number(now.slice(0, 4));
  const first = oldestMonth ? Math.min(Number(oldestMonth.slice(0, 4)), last) : last;
  return Array.from({ length: last - first + 1 }, (_, i) => last - i);
}

/** Tax is filed per calendar year: the selected year, or this year for "Last 12 months". */
export const taxYearOf = (p: Period, now: string) => (p.kind === 'year' ? p.year : Number(now.slice(0, 4)));

/** Whole months from `from` to `to` (YYYY-MM); negative when `to` is earlier. */
export function monthDiff(from: string, to: string): number {
  const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return n(to) - n(from);
}

/** Today in Barcelona, YYYY-MM-DD. */
export const todayDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
```

`src/lib/dashboard/convert.ts`:

```ts
import { rateFor, type MonthlyRates, type RateCurrency } from '@/lib/fx/history';
import { roundMoney } from '@/lib/invoice/totals';
import type { Currency } from '@/lib/invoice/types';
import type { MonthRecord } from '@/lib/shared/types';

/** Used when no monthly rate exists at or before a month (same JPY default as /shared). */
export const FALLBACK_PER_EUR: Record<RateCurrency, number> = { JPY: 177, USD: 1.1 };

export interface Fx {
  rates: MonthlyRates;
  approximate: boolean; // true when live ECB rates could not be fetched
}

/** Live monthly rates, or (when they could not be fetched) each shared month's saved JPY rate, flagged approximate. */
export function buildFx(live: MonthlyRates | null, sharedMonths: MonthRecord[]): Fx {
  if (live) return { rates: live, approximate: false };
  const rates: MonthlyRates = {};
  for (const m of sharedMonths) if (m.fxJpyPerEur > 0) rates[m.month] = { JPY: m.fxJpyPerEur };
  return { rates, approximate: true };
}

export const perEur = (fx: Fx, c: Currency, month: string): number =>
  c === 'EUR' ? 1 : rateFor(fx.rates, month, c) ?? FALLBACK_PER_EUR[c];

/** `amount` in `from` → `to`, both at `month`'s rate (through EUR), rounded to `to`'s minor unit. */
export function convert(amount: number, from: Currency, to: Currency, month: string, fx: Fx): number {
  if (from === to) return roundMoney(amount, to);
  return roundMoney((amount / perEur(fx, from, month)) * perEur(fx, to, month), to);
}
```

`src/lib/dashboard/format.ts`:

```ts
import type { Currency } from '@/lib/invoice/types';

/** Whole units by default (dashboards); `cents` shows EUR/USD minor units (tax figures, invoice totals). */
export function money(x: number, c: Currency, cents = false): string {
  const digits = cents && c !== 'JPY' ? 2 : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

/** Axis ticks: €48.2K, ¥1.3M. */
export const compactMoney = (x: number, c: Currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(x);

/** 2026-10 → "Oct 26". */
export const monthShort = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** 2026-10-20 → "20 Oct". */
export const dayMonth = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const percent = (x: number) => `${Math.round(x * 100)}%`;

export const signedPercent = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

export const delayLabel = (months: number) => (months === 0 ? 'same month' : `+${months} month${months === 1 ? '' : 's'}`);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboardPeriod.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/period.ts src/lib/dashboard/convert.ts src/lib/dashboard/format.ts tests/fixtures/dashboard.ts tests/dashboardPeriod.test.ts
git commit -m "feat(dashboard): period, currency conversion at monthly rates, and formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Business figures

**Files:**
- Create: `src/lib/dashboard/business.ts`
- Test: `tests/dashboardBusiness.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `convert`, `Fx`, `monthDiff`, `DisplayCurrency`
  - from the existing code: `clientKey`, `effectiveCountry`, `effectiveServiceType`, `IndexRow` (`@/lib/invoice/derive`); `addMonths`, `invoiceMonth` (`@/lib/shared/model`); `roundMoney`; `Line`
- Produces:
  - Revenue entries and grouping:
    - `interface RevenueEntry { row: IndexRow; month: string; amount: number }`
    - `revenueEntries(rows, ccy, fx): RevenueEntry[]`
    - `skippedIn(rows, months, field: 'subtotal' | 'total'): number`
    - `interface ShareRow { key: string; name: string; amount: number; pct: number }`
    - `shareBy(entries, months, ccy, group: (r: IndexRow) => { key: string; name: string }): ShareRow[]`
    - `byClient`, `byCountry`, `byService` (group functions)
  - Revenue by month:
    - `type Slot = 's1' | 's2' | 's3' | 's4' | 'other'`
    - `type RevenuePoint = { month: string; total: number; lastYear: number } & Partial<Record<Slot, number>>`
    - `interface RevenueData { series: { slot: Slot; name: string }[]; months: RevenuePoint[]; total: number; previousTotal: number; changePct: number | null }`
    - `revenueByMonth(entries, months, ccy): RevenueData`
  - Unpaid invoices:
    - `UNPAID_FROM = '2025-07'`
    - `interface UnpaidRow { fileId: string; number: string; client: string; month: string; total: number; currency: 'JPY' | 'EUR'; ageMonths: number }`
    - `unpaid(rows, lines, now, ccy, fx): { rows: UnpaidRow[]; total: number }`
  - Payment delay:
    - `interface DelayRow { key: string; name: string; months: number; count: number }`
    - `paymentDelay(rows, lines): DelayRow[]`

- [ ] **Step 1: Write the failing tests**

`tests/dashboardBusiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid } from '@/lib/dashboard/business';
import { periodMonths } from '@/lib/dashboard/period';
import { FX, inv, line } from './fixtures/dashboard';

const months = periodMonths({ kind: '12m' }, '2026-10'); // 2025-11 … 2026-10
const rows = [
  inv('a', { number: '202609001', clientName: 'Matinno', currency: 'JPY', subtotal: 400000, total: 400000, country: 'JP' }),
  inv('b', { number: '202609002', clientName: 'Le Wagon BCN', subtotal: 1000, total: 930, irpfRate: 0.07 }),
  inv('c', { number: '202608001', clientName: 'le wagon bcn ', subtotal: 500, total: 465 }),
  inv('d', { number: '202508001', clientName: 'Matinno', currency: 'JPY', subtotal: 320000, total: 320000, country: 'JP' }),
  inv('e', { number: '202609003', clientName: 'Broken', subtotal: null, total: null }),
];

describe('revenueEntries / skippedIn', () => {
  it('converts subtotals at their month rate and skips invoices without one', () => {
    expect(revenueEntries(rows, 'EUR', FX).map((e) => [e.row.fileId, e.month, e.amount])).toEqual([
      ['a', '2026-09', 2500], ['b', '2026-09', 1000], ['c', '2026-08', 500], ['d', '2025-08', 2000],
    ]);
    expect(skippedIn(rows, months, 'subtotal')).toBe(1);
  });
});

describe('revenueByMonth', () => {
  it('stacks by client, compares with the same months a year earlier', () => {
    const r = revenueByMonth(revenueEntries(rows, 'EUR', FX), months, 'EUR');
    expect(r.series).toEqual([{ slot: 's1', name: 'Matinno' }, { slot: 's2', name: 'Le Wagon BCN' }]);
    expect(r.months.find((p) => p.month === '2026-09')).toEqual({ month: '2026-09', total: 3500, lastYear: 0, s1: 2500, s2: 1000 });
    expect(r.months.find((p) => p.month === '2026-08')).toEqual({ month: '2026-08', total: 500, lastYear: 2000, s2: 500 });
    expect([r.total, r.previousTotal, r.changePct]).toEqual([4000, 2000, 1]);
  });
  it('keeps the 4 largest clients and folds the rest into Other', () => {
    const many = [600, 500, 400, 300, 200, 100].map((s, i) => inv(`x${i}`, { number: `20260900${i + 1}`, clientName: `C${i + 1}`, subtotal: s }));
    const r = revenueByMonth(revenueEntries(many, 'EUR', FX), months, 'EUR');
    expect(r.series.map((s) => s.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'Other']);
    expect(r.months.find((p) => p.month === '2026-09')).toEqual({ month: '2026-09', total: 2100, lastYear: 0, s1: 600, s2: 500, s3: 400, s4: 300, other: 300 });
  });
  it('handles no invoices at all', () => {
    const r = revenueByMonth([], months, 'EUR');
    expect(r.series).toEqual([]);
    expect(r.months).toHaveLength(12);
    expect([r.total, r.changePct]).toEqual([0, null]);
  });
});

describe('shareBy', () => {
  const entries = revenueEntries(rows, 'EUR', FX);
  it('groups clients by clientKey, named after the newest invoice', () => {
    expect(shareBy(entries, months, 'EUR', byClient)).toEqual([
      { key: 'MATINNO', name: 'Matinno', amount: 2500, pct: 0.625 },
      { key: 'LE WAGON BCN', name: 'Le Wagon BCN', amount: 1500, pct: 0.375 },
    ]);
  });
  it('splits by country and service type', () => {
    expect(shareBy(entries, months, 'EUR', byCountry).map((r) => [r.name, r.amount])).toEqual([['JP', 2500], ['ES', 1500]]);
    const mixed = [inv('t', { number: '202609001', subtotal: 300 }), inv('o', { number: '202609002', subtotal: 100, vatRate: 0.21 })];
    expect(shareBy(revenueEntries(mixed, 'EUR', FX), months, 'EUR', byService).map((r) => [r.name, r.amount])).toEqual([['Teaching', 300], ['Other', 100]]);
  });
});

describe('unpaid', () => {
  it('lists unlinked JPY/EUR invoices since 2025-07, oldest first, with a total in the display currency', () => {
    const list = [
      inv('old', { number: '202506001' }),
      inv('usd', { number: '202608009', currency: 'USD', total: 120 }),
      inv('b', { number: '202609002', total: 930 }),
      inv('c', { number: '202608001', clientName: 'LWB', total: 465 }),
      inv('a', { number: '202609001', clientName: 'Matinno', currency: 'JPY', total: 400000 }),
      inv('n', { number: '202609004', total: null }),
      inv('future', { number: '202612001', total: 50 }),
    ];
    const lines = [line({ month: '2026-10', kind: 'income', invoiceId: 'b', amount: 930, currency: 'EUR' })];
    const u = unpaid(list, lines, '2026-10', 'EUR', FX);
    expect(u.rows.map((r) => [r.fileId, r.month, r.ageMonths])).toEqual([['c', '2026-08', 2], ['a', '2026-09', 1], ['future', '2026-12', 0]]);
    expect(u.rows[0]).toEqual({ fileId: 'c', number: '202608001', client: 'LWB', month: '2026-08', total: 465, currency: 'EUR', ageMonths: 2 });
    expect(u.total).toBe(3015);
  });
});

describe('paymentDelay', () => {
  it('gives the median months from invoice to bank per client, ignoring unknown invoices and expenses', () => {
    const list = [
      inv('a', { number: '202608001', clientName: 'Matinno' }), inv('b', { number: '202609001', clientName: 'Matinno' }),
      inv('c', { number: '202607001', clientName: 'LWB' }), inv('d', { number: '202608002', clientName: 'LWB' }),
    ];
    const lines = [
      line({ kind: 'income', month: '2026-08', invoiceId: 'a' }), line({ kind: 'income', month: '2026-10', invoiceId: 'b' }),
      line({ kind: 'income', month: '2026-08', invoiceId: 'c' }), line({ kind: 'income', month: '2026-10', invoiceId: 'd' }),
      line({ kind: 'income', month: '2026-10', invoiceId: 'gone' }), line({ kind: 'expense', month: '2026-10', invoiceId: 'a' }),
    ];
    expect(paymentDelay(list, lines)).toEqual([
      { key: 'LWB', name: 'LWB', months: 1.5, count: 2 },
      { key: 'MATINNO', name: 'Matinno', months: 0.5, count: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboardBusiness.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/dashboard/business"".

- [ ] **Step 3: Implement**

`src/lib/dashboard/business.ts`:

```ts
import { clientKey, effectiveCountry, effectiveServiceType, type IndexRow } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import { addMonths, invoiceMonth } from '@/lib/shared/model';
import type { Line } from '@/lib/shared/types';
import { convert, type Fx } from './convert';
import { monthDiff, type DisplayCurrency } from './period';

/** One invoice's revenue (subtotal) in the display currency, at its month's rate. */
export interface RevenueEntry {
  row: IndexRow;
  month: string;
  amount: number;
}

export function revenueEntries(rows: IndexRow[], ccy: DisplayCurrency, fx: Fx): RevenueEntry[] {
  return rows
    .filter((r) => r.invoice.subtotal != null)
    .map((r) => {
      const month = invoiceMonth(r);
      return { row: r, month, amount: convert(r.invoice.subtotal!, r.invoice.currency, ccy, month, fx) };
    });
}

/** Invoices in `months` whose `field` could not be read (left out of the figures). */
export const skippedIn = (rows: IndexRow[], months: string[], field: 'subtotal' | 'total') =>
  rows.filter((r) => r.invoice[field] == null && months.includes(invoiceMonth(r))).length;

const sum = (xs: number[], ccy: DisplayCurrency) => roundMoney(xs.reduce((a, b) => a + b, 0), ccy);

export interface ShareRow {
  key: string;
  name: string;
  amount: number;
  pct: number; // 0..1 of the period's revenue
}

/** Revenue in `months` grouped by `group`, largest first. Each group is named after its newest invoice. */
export function shareBy(
  entries: RevenueEntry[],
  months: string[],
  ccy: DisplayCurrency,
  group: (r: IndexRow) => { key: string; name: string },
): ShareRow[] {
  const inPeriod = entries.filter((e) => months.includes(e.month)).sort((a, b) => b.month.localeCompare(a.month));
  const acc = new Map<string, { name: string; amount: number }>();
  for (const e of inPeriod) {
    const { key, name } = group(e.row);
    const g = acc.get(key) ?? { name, amount: 0 };
    acc.set(key, { name: g.name, amount: g.amount + e.amount });
  }
  const total = [...acc.values()].reduce((a, g) => a + g.amount, 0);
  return [...acc]
    .map(([key, g]) => ({ key, name: g.name, amount: roundMoney(g.amount, ccy), pct: total ? g.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export const byClient = (r: IndexRow) => ({ key: clientKey(r.invoice.clientName), name: r.invoice.clientName.trim() });
export const byCountry = (r: IndexRow) => {
  const c = effectiveCountry(r);
  return { key: c, name: c === 'unknown' ? 'Unknown' : c };
};
export const byService = (r: IndexRow) => {
  const s = effectiveServiceType(r);
  return { key: s, name: s === 'teaching' ? 'Teaching' : 'Other' };
};

export type Slot = 's1' | 's2' | 's3' | 's4' | 'other';
const SLOTS: Slot[] = ['s1', 's2', 's3', 's4'];

/** One bar: revenue per client slot, the month's total, and the same month a year earlier. */
export type RevenuePoint = { month: string; total: number; lastYear: number } & Partial<Record<Slot, number>>;

export interface RevenueData {
  series: { slot: Slot; name: string }[];
  months: RevenuePoint[];
  total: number;
  previousTotal: number; // the same months one year earlier
  changePct: number | null;
}

/** Monthly revenue stacked by the 4 largest clients of the period, the rest folded into "Other". */
export function revenueByMonth(entries: RevenueEntry[], months: string[], ccy: DisplayCurrency): RevenueData {
  const top = shareBy(entries, months, ccy, byClient);
  const slotOf = new Map(top.slice(0, 4).map((c, i) => [c.key, SLOTS[i]]));
  const series: RevenueData['series'] = top.slice(0, 4).map((c, i) => ({ slot: SLOTS[i], name: c.name }));
  if (top.length > 4) series.push({ slot: 'other', name: 'Other' });

  const totalOf = (m: string) => sum(entries.filter((e) => e.month === m).map((e) => e.amount), ccy);
  const points = months.map((month) => {
    const p: RevenuePoint = { month, total: totalOf(month), lastYear: totalOf(addMonths(month, -12)) };
    for (const e of entries) {
      if (e.month !== month) continue;
      const slot = slotOf.get(byClient(e.row).key) ?? 'other';
      p[slot] = roundMoney((p[slot] ?? 0) + e.amount, ccy);
    }
    return p;
  });
  const total = sum(points.map((p) => p.total), ccy);
  const previousTotal = sum(points.map((p) => p.lastYear), ccy);
  return { series, months: points, total, previousTotal, changePct: previousTotal ? (total - previousTotal) / previousTotal : null };
}

/** The first month whose invoices could be ticked in /shared (its first month, 2025-10, minus the 3-month window). */
export const UNPAID_FROM = '2025-07';

export interface UnpaidRow {
  fileId: string;
  number: string;
  client: string;
  month: string;
  total: number; // in the invoice's own currency
  currency: 'JPY' | 'EUR';
  ageMonths: number;
}

/** JPY/EUR invoices since UNPAID_FROM that no shared income line links to, oldest first. */
export function unpaid(rows: IndexRow[], lines: Line[], now: string, ccy: DisplayCurrency, fx: Fx): { rows: UnpaidRow[]; total: number } {
  const linked = new Set(lines.map((l) => l.invoiceId).filter(Boolean));
  const out = rows
    .flatMap((r): UnpaidRow[] => {
      const { total, currency } = r.invoice;
      const month = invoiceMonth(r);
      if (total == null || (currency !== 'JPY' && currency !== 'EUR') || month < UNPAID_FROM || linked.has(r.fileId)) return [];
      return [{ fileId: r.fileId, number: r.invoice.number ?? r.title, client: r.invoice.clientName, month, total, currency, ageMonths: Math.max(0, monthDiff(month, now)) }];
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.number.localeCompare(b.number));
  return { rows: out, total: sum(out.map((u) => convert(u.total, u.currency, ccy, now, fx)), ccy) };
}

export interface DelayRow {
  key: string;
  name: string;
  months: number; // median months from invoice month to the month it reached the bank
  count: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Per client, the median delay between an invoice's month and the shared month whose income line links it. */
export function paymentDelay(rows: IndexRow[], lines: Line[]): DelayRow[] {
  const byId = new Map(rows.map((r) => [r.fileId, r]));
  const acc = new Map<string, { name: string; delays: number[] }>();
  for (const l of lines) {
    const r = l.kind === 'income' && l.invoiceId ? byId.get(l.invoiceId) : undefined;
    if (!r) continue;
    const { key, name } = byClient(r);
    const g = acc.get(key) ?? { name, delays: [] };
    g.delays.push(monthDiff(invoiceMonth(r), l.month));
    acc.set(key, g);
  }
  return [...acc]
    .map(([key, g]) => ({ key, name: g.name, months: median(g.delays), count: g.delays.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboardBusiness.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/business.ts tests/dashboardBusiness.test.ts
git commit -m "feat(dashboard): revenue by client, shares, unpaid invoices and payment delay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard page with key figures and Business section (end of phase 1)

**Files:**
- Modify: `src/app/globals.css:74-78` (chart tokens)
- Create (generated): `src/components/ui/chart.tsx`, plus `package.json` / `package-lock.json` changes, via `npx shadcn add chart`
- Create: `src/app/dashboard/ui.tsx`, `src/app/dashboard/charts/common.tsx`, `src/app/dashboard/charts/RevenueChart.tsx`, `src/app/dashboard/page.tsx`
- Modify: `src/app/layout.tsx:18` (nav link)

**Interfaces:**
- Consumes:
  - from Tasks 1–3: everything listed above
  - from the existing code: `getGoogle`, `requireIds`, `syncIndex`, `findSharedId`, `readShared`, `currentMonth`, `invoiceMonth`, `monthLabel`, `SyncWarning`, `Card*`
- Produces (used by Tasks 6 and 8):
  - `ui.tsx`: `Section`, `Panel`, `Stat`, `Pill`, `ShareBars`, `Empty`, `NotImported`
  - `charts/common.tsx`: `SERIES`, `AXIS`, `moneyRow(config, ccy, detail?)`, `monthLabelFormatter`
  - the page's local values `now`, `today`, `fx`, `ccy`, `period`, `months`, `shared`, `rows`, which later tasks extend

- [ ] **Step 1: Read the Next.js docs for this version**

Read the App Router page and linking guides in `node_modules/next/dist/docs/` (search with `ls node_modules/next/dist/docs` and `grep -ril searchParams node_modules/next/dist/docs | head`). Confirm that `searchParams` is still a Promise in pages and that `next/link` needs no changes. Follow any deprecation notices in the code below.

- [ ] **Step 2: Add the chart component and replace the chart tokens**

Run: `npx shadcn add chart --yes`
Expected:
- `src/components/ui/chart.tsx` is created;
- `recharts` is added to `package.json` dependencies;
- `git diff --stat` shows only `package.json`, `package-lock.json` and the new file.

If the CLI also edits `src/app/globals.css`, revert that hunk (`git checkout -p src/app/globals.css`).

Then in `src/app/globals.css`, replace lines 74–78 (`--chart-1: #0d6e68;` … `--chart-5: #2d2880;`) with:

```css
  /* Validated with the dataviz palette script against the dark card surface (#14161d):
     lightness band, chroma, CVD/normal-vision separation and ≥3:1 contrast all pass. */
  --chart-1: #1f9e94;
  --chart-2: #c08a1e;
  --chart-3: #4a8fe0;
  --chart-4: #e0608d;
  --chart-5: #8a80e8;
  --chart-other: #7c7b78;
  --chart-muted: rgb(240 237 232 / 0.35);
  --chart-gap: #12141c;
```

- [ ] **Step 3: Write the server building blocks**

`src/app/dashboard/ui.tsx`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShareRow } from '@/lib/dashboard/business';
import { money, percent } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="eyebrow border-l-[2.5px] border-foreground/20 pl-3 text-foreground/50">{title}</h2>
      {children}
    </section>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: ReactNode; warn?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <p className={`text-2xl font-black tabular-nums ${warn ? 'text-destructive' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-foreground/50">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-foreground/60' : 'border-foreground/10 text-foreground/50 hover:text-foreground'}`}
    >
      {children}
    </Link>
  );
}

export const Empty = ({ children = 'Nothing in this period' }: { children?: ReactNode }) => (
  <p className="py-8 text-center text-sm text-foreground/40">{children}</p>
);

export const NotImported = () => (
  <p className="text-sm text-foreground/60">
    The “Shared account money” sheet is not imported yet. <Link className="underline" href="/settings">Import it in Settings</Link>.
  </p>
);

/** Ranked horizontal bars (one measure, one colour), labelled with share and amount. */
export function ShareBars({ rows, ccy }: { rows: ShareRow[]; ccy: DisplayCurrency }) {
  if (!rows.length) return <Empty />;
  const max = rows[0].amount || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.name}>{r.name}</span>
          <span className="h-2">
            <span className="block h-full rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(1, (r.amount / max) * 100)}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-foreground/60">{percent(r.pct)} · {money(r.amount, ccy)}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write the shared chart helpers and the revenue chart**

`src/app/dashboard/charts/common.tsx`:

```tsx
import type { ChartConfig } from '@/components/ui/chart';
import { money, monthShort } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';

/** Categorical slots in fixed order; "other" is always the neutral grey. */
export const SERIES = { s1: 'var(--chart-1)', s2: 'var(--chart-2)', s3: 'var(--chart-3)', s4: 'var(--chart-4)', other: 'var(--chart-other)' } as const;

/** Recessive axes: no tick marks or axis lines, the grid carries the scale. */
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

export const monthLabelFormatter = (m: unknown) => monthShort(String(m));

/**
 * Tooltip row: swatch, series label, amount in the display currency, and optional detail (e.g. the expense labels).
 * Zero values are hidden so stacked tooltips only list what is in the bar.
 */
export function moneyRow(config: ChartConfig, ccy: DisplayCurrency, detail?: (key: string, payload: Record<string, unknown>) => string | undefined) {
  return function MoneyRow(value: unknown, name: unknown, item: { color?: string; payload?: Record<string, unknown> }) {
    if (!Number(value)) return null;
    const key = String(name);
    const extra = detail?.(key, item.payload ?? {});
    return (
      <div className="flex w-full flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
          <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
          <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">{money(Number(value), ccy)}</span>
        </div>
        {extra && <span className="pl-4.5 text-[10px] text-muted-foreground">{extra}</span>}
      </div>
    );
  };
}
```

`src/app/dashboard/charts/RevenueChart.tsx`:

```tsx
'use client';

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { RevenueData } from '@/lib/dashboard/business';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

export function RevenueChart({ data, ccy }: { data: RevenueData; ccy: DisplayCurrency }) {
  const config: ChartConfig = {
    ...Object.fromEntries(data.series.map((s) => [s.slot, { label: s.name, color: SERIES[s.slot] }])),
    lastYear: { label: 'Same month last year', color: 'var(--chart-muted)' },
  };
  const top = data.series.at(-1)?.slot;
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart data={data.months} margin={{ top: 8, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {data.series.map((s) => (
          <Bar
            key={s.slot}
            dataKey={s.slot}
            stackId="revenue"
            fill={`var(--color-${s.slot})`}
            stroke="var(--chart-gap)"
            strokeWidth={2}
            maxBarSize={24}
            radius={s.slot === top ? [4, 4, 0, 0] : 0}
          />
        ))}
        <Line dataKey="lastYear" type="monotone" stroke="var(--color-lastYear)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 5: Write the page**

`src/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link';
import { SyncWarning } from '@/components/SyncWarning';
import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, UNPAID_FROM, unpaid } from '@/lib/dashboard/business';
import { buildFx } from '@/lib/dashboard/convert';
import { delayLabel, money, monthShort, percent, signedPercent } from '@/lib/dashboard/format';
import { parseCcy, parsePeriod, periodLabel, periodMonths, periodParam, todayDate, yearOptions } from '@/lib/dashboard/period';
import { fetchMonthlyRates } from '@/lib/fx/history';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { currentMonth, invoiceMonth, monthLabel } from '@/lib/shared/model';
import { findSharedId, readShared } from '@/lib/shared/store';
import { RevenueChart } from './charts/RevenueChart';
import { Empty, NotImported, Panel, Pill, Section, ShareBars, Stat } from './ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; ccy?: string }> }) {
  const params = await searchParams;
  const g = await getGoogle();
  const [{ rows, failed }, shared] = await Promise.all([
    syncIndex(g, await requireIds(g)),
    findSharedId(g.drive).then((id) => (id ? readShared(g.sheets, id) : null)),
  ]);
  const now = currentMonth();
  const today = todayDate();
  const oldest = rows.length ? rows.map(invoiceMonth).sort()[0] : null;
  const fx = buildFx(await fetchMonthlyRates(oldest ?? now, today), shared?.months ?? []);

  const years = yearOptions(oldest, now);
  const period = parsePeriod(params.p, years);
  const ccy = parseCcy(params.ccy);
  const months = periodMonths(period, now);
  const href = (p: string, c: string) => `/dashboard?${new URLSearchParams({ p, ccy: c })}`;

  const entries = revenueEntries(rows, ccy, fx);
  const revenue = revenueByMonth(entries, months, ccy);
  const clients = shareBy(entries, months, ccy, byClient);
  const skipped = skippedIn(rows, months, 'subtotal');
  const open = shared ? unpaid(rows, shared.lines, now, ccy, fx) : null;
  const delays = shared ? paymentDelay(rows, shared.lines) : [];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="mb-4 text-[clamp(2.4rem,8vw,4.5rem)] leading-[0.92] font-black tracking-[-0.03em]">Dashboard</h1>
        <p className="border-l-[2.5px] border-foreground/20 pl-3 text-xs font-semibold tracking-[0.12em] text-foreground/40 uppercase">
          {periodLabel(period)} · {ccy === 'JPY' ? 'Yen' : 'Euro'} · ECB monthly rates
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Period and currency">
        <Pill href={href('12m', ccy)} active={period.kind === '12m'}>Last 12 months</Pill>
        {years.map((y) => (
          <Pill key={y} href={href(String(y), ccy)} active={period.kind === 'year' && period.year === y}>{y}</Pill>
        ))}
        <span className="ml-auto flex gap-1.5">
          <Pill href={href(periodParam(period), 'EUR')} active={ccy === 'EUR'}>€</Pill>
          <Pill href={href(periodParam(period), 'JPY')} active={ccy === 'JPY'}>¥</Pill>
        </span>
      </nav>

      <SyncWarning failed={failed.length} consequence="The figures use those invoices as they were at the last successful sync." />
      {fx.approximate && (
        <p role="alert" className="rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-200">
          Exchange rates unavailable — converted amounts are approximate.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Revenue"
          value={money(revenue.total, ccy)}
          sub={revenue.changePct == null ? 'no previous period' : `${signedPercent(revenue.changePct)} vs previous period`}
        />
        <Stat
          label="Unpaid"
          value={open ? money(open.total, ccy) : '—'}
          sub={open ? plural(open.rows.length, 'invoice') : 'shared account not imported'}
        />
      </div>

      <Section title="Business">
        <Panel title="Revenue by month">
          {revenue.series.length ? <RevenueChart data={revenue} ccy={ccy} /> : <Empty />}
          {skipped > 0 && <p className="mt-2 text-xs text-foreground/40">{plural(skipped, 'invoice')} skipped (no subtotal)</p>}
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Client share">
            {clients.length > 0 && <p className="mb-3 text-xs text-foreground/50">Top client: {percent(clients[0].pct)}</p>}
            <ShareBars rows={clients} ccy={ccy} />
          </Panel>
          <Panel title="Unpaid invoices">
            {!open ? (
              <NotImported />
            ) : open.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="eyebrow text-left text-foreground/50">
                    <tr><th className="py-1.5 font-bold">Number</th><th className="font-bold">Client</th><th className="font-bold">Month</th><th className="text-right font-bold">Total</th><th className="text-right font-bold">Age</th></tr>
                  </thead>
                  <tbody>
                    {open.rows.map((u) => (
                      <tr key={u.fileId} className="border-t border-foreground/10">
                        <td className="py-1.5"><Link className="underline" href={`/invoices/${u.fileId}`}>{u.number}</Link></td>
                        <td className="max-w-28 truncate pr-2">{u.client}</td>
                        <td className="whitespace-nowrap">{monthShort(u.month)}</td>
                        <td className="text-right tabular-nums">{money(u.total, u.currency, true)}</td>
                        <td className="text-right whitespace-nowrap">{u.ageMonths === 0 ? 'this month' : `${u.ageMonths} mo`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Everything since {monthLabel(UNPAID_FROM)} has been paid</Empty>
            )}
            {delays.length > 0 && (
              <p className="mt-3 text-xs text-foreground/50">Typical delay: {delays.map((d) => `${d.name}: ${delayLabel(d.months)}`).join(' · ')}</p>
            )}
          </Panel>
          <Panel title="By country">
            <ShareBars rows={shareBy(entries, months, ccy, byCountry)} ccy={ccy} />
          </Panel>
          <Panel title="By service">
            <ShareBars rows={shareBy(entries, months, ccy, byService)} ccy={ccy} />
          </Panel>
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

In `src/app/layout.tsx`, insert before `<Link href="/" className={navLink}>Invoices</Link>`:

```tsx
            <Link href="/dashboard" className={navLink}>Dashboard</Link>
```

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors, and all tests pass.

If `moneyRow`'s return type is rejected as a `formatter` prop, type the inner function's parameters from Recharts instead:

```ts
import type { NameType, Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';
```

Then use `(value: ValueType, name: NameType, item: Payload<ValueType, NameType>)`. Keep the body unchanged.

- [ ] **Step 8: Check it in the browser**

Run `npm run dev` and open `http://localhost:3000/dashboard` while signed in. Check:
- the four period pills and the € / ¥ pills change the URL and the figures;
- the revenue bars are stacked by client, with the legend and the "Same month last year" line;
- the tooltip shows amounts with currency symbols;
- the unpaid table links to the invoices;
- at phone width (resize to 390px), the page is one column with no horizontal page scroll;
- the bars' top corners are rounded and the gaps between stacked segments are visible.

Compare one month's revenue against the invoice sheets by hand.

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css src/components/ui/chart.tsx package.json package-lock.json src/app/dashboard src/app/layout.tsx
git commit -m "feat(dashboard): /dashboard with key figures and Business section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Household figures

**Files:**
- Create: `src/lib/dashboard/household.ts`
- Test: `tests/dashboardHousehold.test.ts`

**Interfaces:**
- Consumes:
  - `totals(lines, fx)` from `@/lib/shared/model` (returns `transferJpy`, `transferEur`)
  - `roundMoney`; `Line`, `LineCurrency`, `MonthRecord`
  - from Task 2: `FALLBACK_PER_EUR`, `DisplayCurrency`
- Produces:
  - Expense categories:
    - `EXPENSE_CATEGORIES` (readonly `{ id, label }[]`: tax, savings, housing, subs, other)
    - `type ExpenseCategory = 'tax' | 'savings' | 'housing' | 'subs' | 'other'`
    - `expenseCategory(l: Pick<Line, 'label' | 'inst'>): ExpenseCategory`
  - `inDisplay(amount, from: LineCurrency, ccy, fx: number): number`
  - Transfers:
    - `interface TransferPoint { month: string; amount: number }`
    - `transfers(months, lines, ccy): { points: TransferPoint[]; average: number }`
    - `monthTransfer(months, lines, month, ccy): number | null`
  - Expense breakdown:
    - `type ExpensePoint = { month: string; labels: Partial<Record<ExpenseCategory, string[]>> } & Record<ExpenseCategory, number>`
    - `expenseBreakdown(months, lines, ccy): ExpensePoint[]`
  - Income by currency:
    - `interface IncomeCurrencyPoint { month: string; fromJpy: number; fromEur: number; fx: number }`
    - `incomeByCurrency(months, lines, ccy): IncomeCurrencyPoint[]`

- [ ] **Step 1: Write the failing tests**

`tests/dashboardHousehold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expenseBreakdown, expenseCategory, inDisplay, incomeByCurrency, monthTransfer, transfers } from '@/lib/dashboard/household';
import { line, monthRec } from './fixtures/dashboard';

describe('expenseCategory', () => {
  it('sorts every real label of the shared sheet', () => {
    const cases: [string, string][] = [
      ['Rental', 'housing'], ['Half Rental Airbnb', 'housing'], ['Gym', 'subs'], ['Subscription Claude', 'subs'],
      ['Savings', 'savings'], ['Autonomo cotisation', 'tax'], ['Tax Yann Q1', 'tax'], ['Tax 2nd semester', 'tax'],
      ['Spendings', 'other'], ['Additional Spendings', 'other'], ['Miscalc Matinno', 'other'],
    ];
    for (const [label, cat] of cases) expect([label, expenseCategory({ label, inst: null })]).toEqual([label, cat]);
  });
  it('counts any instalment as tax', () => expect(expenseCategory({ label: 'Anything', inst: { total: 3, index: 1, count: 3 } })).toBe('tax'));
});

// Sep: ¥404,000 in, ¥150,000 savings and €500 rent out at 160 → ¥174,000.
// Aug: €1,000 in, ¥200,000 out, saved with rate 0 → falls back to 177 → −¥23,000.
const months = [monthRec('2026-09', 160), monthRec('2026-08', 0)];
const lines = [
  line({ month: '2026-09', kind: 'income', label: 'Matinno', amount: 404000, currency: 'JPY' }),
  line({ month: '2026-09', label: 'Savings', amount: 150000, currency: 'JPY' }),
  line({ month: '2026-09', label: 'Rental', amount: 500, currency: 'EUR' }),
  line({ month: '2026-08', kind: 'income', label: 'LWB', amount: 1000, currency: 'EUR' }),
  line({ month: '2026-08', label: 'Spendings', amount: 200000, currency: 'JPY' }),
];

describe('transfers', () => {
  it('uses each month’s own rate (177 when the saved rate is unusable), sorted by month', () => {
    expect(transfers(months, lines, 'JPY')).toEqual({ points: [{ month: '2026-08', amount: -23000 }, { month: '2026-09', amount: 174000 }], average: 75500 });
    expect(transfers(months, lines, 'EUR')).toEqual({ points: [{ month: '2026-08', amount: -129.94 }, { month: '2026-09', amount: 1087.5 }], average: 478.78 });
  });
  it('gives this month’s transfer, or null when the month is not saved', () => {
    expect(monthTransfer(months, lines, '2026-09', 'JPY')).toBe(174000);
    expect(monthTransfer(months, lines, '2026-10', 'JPY')).toBeNull();
  });
  it('has no points and a zero average with no saved months', () => expect(transfers([], [], 'EUR')).toEqual({ points: [], average: 0 }));
});

describe('expenseBreakdown', () => {
  it('sums expenses per category in the display currency and keeps their labels', () => {
    expect(expenseBreakdown(months, lines, 'EUR').find((p) => p.month === '2026-09')).toEqual({
      month: '2026-09', tax: 0, savings: 937.5, housing: 500, subs: 0, other: 0, labels: { savings: ['Savings'], housing: ['Rental'] },
    });
  });
});

describe('incomeByCurrency', () => {
  it('splits income by the currency it arrived in, with the month rate', () => {
    expect(incomeByCurrency(months, lines, 'JPY')).toEqual([
      { month: '2026-08', fromJpy: 0, fromEur: 177000, fx: 177 },
      { month: '2026-09', fromJpy: 404000, fromEur: 0, fx: 160 },
    ]);
  });
  it('converts both ways', () => {
    expect(inDisplay(500, 'EUR', 'JPY', 160)).toBe(80000);
    expect(inDisplay(80000, 'JPY', 'EUR', 160)).toBe(500);
    expect(inDisplay(12.3456, 'EUR', 'EUR', 160)).toBe(12.35);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboardHousehold.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/dashboard/household"".

- [ ] **Step 3: Implement**

`src/lib/dashboard/household.ts`:

```ts
import { roundMoney } from '@/lib/invoice/totals';
import { totals } from '@/lib/shared/model';
import type { Line, LineCurrency, MonthRecord } from '@/lib/shared/types';
import { FALLBACK_PER_EUR } from './convert';
import type { DisplayCurrency } from './period';

/** In chart order: slots 1–4, then the grey "Other". */
export const EXPENSE_CATEGORIES = [
  { id: 'tax', label: 'Taxes & social security' },
  { id: 'savings', label: 'Savings' },
  { id: 'housing', label: 'Housing' },
  { id: 'subs', label: 'Subscriptions & gym' },
  { id: 'other', label: 'Other' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id'];

const RULES: [ExpenseCategory, RegExp][] = [
  ['tax', /tax|irpf|\biva\b|hacienda|aut[oó]nomo|cotisation|cuota|seguridad social/i],
  ['savings', /saving/i],
  ['housing', /rent|alquiler|airbnb/i],
  ['subs', /subscription|gym|netflix|spotify/i],
];

/** Expense labels are free text; the first matching rule wins. Any instalment is a tax payment. */
export function expenseCategory(l: Pick<Line, 'label' | 'inst'>): ExpenseCategory {
  if (l.inst) return 'tax';
  return RULES.find(([, re]) => re.test(l.label))?.[0] ?? 'other';
}

const fxOf = (m: MonthRecord) => (m.fxJpyPerEur > 0 ? m.fxJpyPerEur : FALLBACK_PER_EUR.JPY);
const byMonth = (months: MonthRecord[]) => [...months].sort((a, b) => a.month.localeCompare(b.month));
const linesOf = (lines: Line[], month: string) => lines.filter((l) => l.month === month);

/** A shared-account amount in the display currency, at that month's own JPY/EUR rate. */
export function inDisplay(amount: number, from: LineCurrency, ccy: DisplayCurrency, fx: number): number {
  if (from === ccy) return roundMoney(amount, ccy);
  return roundMoney(from === 'EUR' ? amount * fx : amount / fx, ccy);
}

function transferOf(m: MonthRecord, lines: Line[], ccy: DisplayCurrency): number {
  const t = totals(linesOf(lines, m.month), fxOf(m));
  return ccy === 'JPY' ? t.transferJpy : t.transferEur;
}

export interface TransferPoint {
  month: string;
  amount: number;
}

export function transfers(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): { points: TransferPoint[]; average: number } {
  const points = byMonth(months).map((m) => ({ month: m.month, amount: transferOf(m, lines, ccy) }));
  const average = points.length ? roundMoney(points.reduce((a, p) => a + p.amount, 0) / points.length, ccy) : 0;
  return { points, average };
}

export function monthTransfer(months: MonthRecord[], lines: Line[], month: string, ccy: DisplayCurrency): number | null {
  const m = months.find((x) => x.month === month);
  return m ? transferOf(m, lines, ccy) : null;
}

export type ExpensePoint = { month: string; labels: Partial<Record<ExpenseCategory, string[]>> } & Record<ExpenseCategory, number>;

export function expenseBreakdown(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): ExpensePoint[] {
  return byMonth(months).map((m) => {
    const p: ExpensePoint = { month: m.month, tax: 0, savings: 0, housing: 0, subs: 0, other: 0, labels: {} };
    for (const l of linesOf(lines, m.month)) {
      if (l.kind !== 'expense') continue;
      const c = expenseCategory(l);
      p[c] = roundMoney(p[c] + inDisplay(l.amount, l.currency, ccy, fxOf(m)), ccy);
      (p.labels[c] ??= []).push(l.label);
    }
    return p;
  });
}

export interface IncomeCurrencyPoint {
  month: string;
  fromJpy: number; // income that arrived in yen, in the display currency
  fromEur: number; // income that arrived in euros, in the display currency
  fx: number; // the month's JPY per EUR
}

export function incomeByCurrency(months: MonthRecord[], lines: Line[], ccy: DisplayCurrency): IncomeCurrencyPoint[] {
  return byMonth(months).map((m) => {
    const p = { month: m.month, fromJpy: 0, fromEur: 0, fx: fxOf(m) };
    for (const l of linesOf(lines, m.month)) {
      if (l.kind !== 'income') continue;
      const key = l.currency === 'JPY' ? 'fromJpy' : 'fromEur';
      p[key] = roundMoney(p[key] + inDisplay(l.amount, l.currency, ccy, p.fx), ccy);
    }
    return p;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboardHousehold.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/household.ts tests/dashboardHousehold.test.ts
git commit -m "feat(dashboard): household transfers, expense categories and income by currency

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Household section and "Transfer this month" (end of phase 2)

**Files:**
- Create: `src/app/dashboard/charts/TransferChart.tsx`, `src/app/dashboard/charts/ExpenseChart.tsx`, `src/app/dashboard/charts/IncomeCurrencyChart.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes:
  - from Task 5: `transfers`, `monthTransfer`, `expenseBreakdown`, `incomeByCurrency`, `EXPENSE_CATEGORIES`, and the types
  - from Task 4: `SERIES`, `AXIS`, `moneyRow`, `monthLabelFormatter`, and the `ui.tsx` blocks
- Produces: the Household section on the page.

- [ ] **Step 1: Write the three charts**

`src/app/dashboard/charts/TransferChart.tsx`:

```tsx
'use client';

import { Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { TransferPoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

export function TransferChart({ points, average, ccy }: { points: TransferPoint[]; average: number; ccy: DisplayCurrency }) {
  const config: ChartConfig = { amount: { label: 'Transfer', color: SERIES.s1 } };
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <ComposedChart data={points} margin={{ top: 16, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ReferenceLine
          y={average}
          stroke="var(--chart-muted)"
          strokeDasharray="4 4"
          label={{ value: `avg ${compactMoney(average, ccy)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
        <Bar dataKey="amount" fill="var(--color-amount)" maxBarSize={24} radius={[4, 4, 0, 0]}>
          {points.map((p) => (
            <Cell key={p.month} fill={p.amount < 0 ? 'var(--destructive)' : 'var(--color-amount)'} />
          ))}
        </Bar>
      </ComposedChart>
    </ChartContainer>
  );
}
```

`src/app/dashboard/charts/ExpenseChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpensePoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

const COLORS = [SERIES.s1, SERIES.s2, SERIES.s3, SERIES.s4, SERIES.other];

export function ExpenseChart({ points, ccy }: { points: ExpensePoint[]; ccy: DisplayCurrency }) {
  const config: ChartConfig = Object.fromEntries(EXPENSE_CATEGORIES.map((c, i) => [c.id, { label: c.label, color: COLORS[i] }]));
  const labelsOf = (key: string, payload: Record<string, unknown>) => (payload.labels as ExpensePoint['labels'])[key as ExpenseCategory]?.join(', ');
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={points} margin={{ top: 8, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy, labelsOf)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {EXPENSE_CATEGORIES.map((c) => (
          <Bar
            key={c.id}
            dataKey={c.id}
            stackId="expenses"
            fill={`var(--color-${c.id})`}
            stroke="var(--chart-gap)"
            strokeWidth={2}
            maxBarSize={24}
            radius={c.id === 'other' ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
```

`src/app/dashboard/charts/IncomeCurrencyChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { IncomeCurrencyPoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

/** Income by arrival currency on top, the month's ¥/€ rate below on the same month axis (two charts, never two y-axes). */
export function IncomeCurrencyChart({ points, ccy }: { points: IncomeCurrencyPoint[]; ccy: DisplayCurrency }) {
  const config: ChartConfig = {
    fromJpy: { label: 'Arrived in ¥', color: SERIES.s1 },
    fromEur: { label: 'Arrived in €', color: SERIES.s2 },
    fx: { label: '¥ per €', color: SERIES.s3 },
  };
  return (
    <div className="space-y-1">
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <BarChart data={points} margin={{ top: 8, left: 0, right: 0 }} syncId="household-income">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
          <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="fromJpy" stackId="income" fill="var(--color-fromJpy)" stroke="var(--chart-gap)" strokeWidth={2} maxBarSize={24} />
          <Bar dataKey="fromEur" stackId="income" fill="var(--color-fromEur)" stroke="var(--chart-gap)" strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <ChartContainer config={config} className="aspect-auto h-28 w-full">
        <LineChart data={points} margin={{ top: 8, left: 0, right: 0 }} syncId="household-income">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
          <YAxis domain={['auto', 'auto']} width={60} {...AXIS} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} />} />
          <Line dataKey="fx" type="monotone" stroke="var(--color-fx)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-gap)', fill: 'var(--color-fx)' }} />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-foreground/50">Lower: ¥ per € each month (ECB rate saved with the month).</p>
    </div>
  );
}
```

- [ ] **Step 2: Wire the section into the page**

In `src/app/dashboard/page.tsx`:

1. Add these imports:

```tsx
import { expenseBreakdown, incomeByCurrency, monthTransfer, transfers } from '@/lib/dashboard/household';
import { ExpenseChart } from './charts/ExpenseChart';
import { IncomeCurrencyChart } from './charts/IncomeCurrencyChart';
import { TransferChart } from './charts/TransferChart';
```

2. After `const delays = …`, add:

```tsx
  const household = shared && {
    transfers: transfers(shared.months, shared.lines, ccy),
    expenses: expenseBreakdown(shared.months, shared.lines, ccy),
    income: incomeByCurrency(shared.months, shared.lines, ccy),
    thisMonth: monthTransfer(shared.months, shared.lines, now, ccy),
  };
```

3. After the `Unpaid` `<Stat … />`, add the fourth tile. "Next filing" will come third in Task 8.

```tsx
        <Stat
          label="Transfer this month"
          value={household?.thisMonth != null ? money(household.thisMonth, ccy) : '—'}
          warn={household?.thisMonth != null && household.thisMonth < 0}
          sub={!household ? 'shared account not imported' : household.thisMonth != null ? monthLabel(now) : <Link className="underline" href="/shared">not saved yet</Link>}
        />
```

4. After the closing `</Section>` of Business, add:

```tsx
      <Section title="Household">
        {!household ? (
          <NotImported />
        ) : !household.transfers.points.length ? (
          <Empty>No saved months yet</Empty>
        ) : (
          <>
            <Panel title="Transfer per month">
              <TransferChart points={household.transfers.points} average={household.transfers.average} ccy={ccy} />
              <p className="mt-2 text-xs text-foreground/50">Red bars: months where expenses were larger than income. Dashed line: average.</p>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Expenses">
                <ExpenseChart points={household.expenses} ccy={ccy} />
              </Panel>
              <Panel title="Income by currency">
                <IncomeCurrencyChart points={household.income} ccy={ccy} />
              </Panel>
            </div>
          </>
        )}
      </Section>
```

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors, and all tests pass.

- [ ] **Step 4: Check it in the browser**

Open `http://localhost:3000/dashboard`. Check:
- the Household section shows every saved month since Oct 2025;
- Aug 2026 is a red bar;
- the dashed average line has its label;
- hovering an expense segment lists its labels (e.g. "Rental, Half Rental Airbnb");
- the rate line sits under the income bars, and hovering one chart highlights the same month in the other;
- € / ¥ switches all three charts;
- the "Transfer this month" tile reads "not saved yet" when Oct 2026 isn't saved, and links to `/shared`.

Then check negative bars: Aug 2026's bar must be rounded at its bottom end (the value end), not at the zero line. Recharts draws a negative bar from its value end, so `radius={[4, 4, 0, 0]}` lands on the right corners for both signs.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard
git commit -m "feat(dashboard): Household section and this month's transfer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tax figures

**Files:**
- Create: `src/lib/dashboard/tax.ts`
- Test: `tests/dashboardTax.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `convert`, `Fx`
  - from the existing code: `invoiceMonth`, `roundMoney`, `IndexRow`, `Line`, `LineCurrency`, `MonthRecord`
- Produces:
  - Quarters:
    - `type Quarter = 1 | 2 | 3 | 4`
    - `type QuarterStatus = 'done' | 'so-far' | 'future'`
    - `interface TaxSums { base: number; vat: number; irpf: number; withholding: number }` (EUR)
    - `interface QuarterRow extends TaxSums { year: number; q: Quarter; due: string; status: QuarterStatus }`
    - `quarterOf(month): Quarter`
    - `dueDate(year, q): string`
    - `taxQuarters(rows, year, today, fx): { quarters: QuarterRow[]; total: TaxSums; skipped: number }`
    - `nextFiling(rows, today, fx): QuarterRow`
  - Instalments:
    - `interface InstalmentRow { label: string; index: number; count: number; amount: number; currency: LineCurrency; remaining: number }`
    - `instalmentsInProgress(months, lines): InstalmentRow[]`

- [ ] **Step 1: Write the failing tests**

`tests/dashboardTax.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dueDate, instalmentsInProgress, nextFiling, quarterOf, taxQuarters } from '@/lib/dashboard/tax';
import { FX, inv, line, monthRec } from './fixtures/dashboard';

const rows = [
  inv('a', { number: '202602001', subtotal: 1000, vatRate: 0.21, irpfRate: 0.07 }),
  inv('b', { number: '202608001', currency: 'JPY', country: 'JP', subtotal: 400000, withholdingRate: 0.1021 }),
  inv('c', { number: '202609002', subtotal: 500, irpfRate: 0.07 }),
  inv('d', { number: '202609003', subtotal: null }),
  inv('e', { number: '202512001', subtotal: 999, vatRate: 0.21 }),
];

describe('quarters and deadlines', () => {
  it('maps months to quarters', () => expect(['2026-01', '2026-03', '2026-04', '2026-12'].map(quarterOf)).toEqual([1, 1, 2, 4]));
  it('gives Spanish filing deadlines, Q4 in the following January', () => {
    expect([dueDate(2026, 1), dueDate(2026, 2), dueDate(2026, 3), dueDate(2026, 4)]).toEqual(['2026-04-20', '2026-07-20', '2026-10-20', '2027-01-30']);
  });
});

describe('taxQuarters', () => {
  it('sums base, VAT, IRPF and foreign withholding per quarter in EUR', () => {
    const t = taxQuarters(rows, 2026, '2026-10-12', FX);
    expect(t.quarters).toEqual([
      { year: 2026, q: 1, due: '2026-04-20', status: 'done', base: 1000, vat: 210, irpf: 70, withholding: 0 },
      { year: 2026, q: 2, due: '2026-07-20', status: 'done', base: 0, vat: 0, irpf: 0, withholding: 0 },
      { year: 2026, q: 3, due: '2026-10-20', status: 'done', base: 3000, vat: 0, irpf: 35, withholding: 255.25 },
      { year: 2026, q: 4, due: '2027-01-30', status: 'so-far', base: 0, vat: 0, irpf: 0, withholding: 0 },
    ]);
    expect(t.total).toEqual({ base: 4000, vat: 210, irpf: 105, withholding: 255.25 });
    expect(t.skipped).toBe(1);
  });
  it('marks quarters of a later year as future', () => {
    expect(taxQuarters(rows, 2027, '2026-10-12', FX).quarters.map((q) => q.status)).toEqual(['future', 'future', 'future', 'future']);
  });
});

describe('nextFiling', () => {
  it('is the quarter whose deadline comes next', () => {
    expect(nextFiling(rows, '2026-10-12', FX)).toMatchObject({ year: 2026, q: 3, status: 'done', irpf: 35 });
    expect(nextFiling(rows, '2026-10-20', FX)).toMatchObject({ year: 2026, q: 3 });
    expect(nextFiling(rows, '2026-10-21', FX)).toMatchObject({ year: 2026, q: 4, status: 'so-far' });
    expect(nextFiling(rows, '2027-01-15', FX)).toMatchObject({ year: 2026, q: 4, status: 'done' });
  });
});

describe('instalmentsInProgress', () => {
  it('lists the latest saved month’s instalments with what is left', () => {
    const months = [monthRec('2026-09'), monthRec('2026-08')];
    const lines = [
      line({ month: '2026-08', label: 'Tax 2nd semester', amount: 866, currency: 'EUR', inst: { total: 2598, index: 1, count: 3 } }),
      line({ month: '2026-09', label: 'Tax 2nd semester', amount: 866, currency: 'EUR', inst: { total: 2598, index: 2, count: 3 } }),
      line({ month: '2026-09', label: 'Odd edit', amount: 2000, currency: 'EUR', inst: { total: 3000, index: 2, count: 2 } }),
      line({ month: '2026-09', label: 'Gym', amount: 18000 }),
    ];
    expect(instalmentsInProgress(months, lines)).toEqual([
      { label: 'Tax 2nd semester', index: 2, count: 3, amount: 866, currency: 'EUR', remaining: 866 },
      { label: 'Odd edit', index: 2, count: 2, amount: 2000, currency: 'EUR', remaining: 0 },
    ]);
  });
  it('is empty with no saved months', () => expect(instalmentsInProgress([], [])).toEqual([]));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboardTax.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/dashboard/tax"".

- [ ] **Step 3: Implement**

`src/lib/dashboard/tax.ts`:

```ts
import type { IndexRow } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import { invoiceMonth } from '@/lib/shared/model';
import type { Line, LineCurrency, MonthRecord } from '@/lib/shared/types';
import { convert, type Fx } from './convert';

export type Quarter = 1 | 2 | 3 | 4;
export type QuarterStatus = 'done' | 'so-far' | 'future';

/** All in EUR. */
export interface TaxSums {
  base: number; // Σ subtotal
  vat: number; // VAT charged (Modelo 303)
  irpf: number; // IRPF withheld by Spanish clients (subtracted in Modelo 130)
  withholding: number; // foreign withholding (double-taxation credit)
}

export interface QuarterRow extends TaxSums {
  year: number;
  q: Quarter;
  due: string; // YYYY-MM-DD
  status: QuarterStatus;
}

export const quarterOf = (month: string) => (Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1) as Quarter;

/** Modelo 303/130 deadlines: 20 Apr, 20 Jul, 20 Oct, and 30 Jan of the following year. */
export const dueDate = (year: number, q: Quarter) => (q === 4 ? `${year + 1}-01-30` : `${year}-${['04', '07', '10'][q - 1]}-20`);

function statusOf(year: number, q: Quarter, today: string): QuarterStatus {
  const now = today.slice(0, 7);
  const first = `${year}-${String(q * 3 - 2).padStart(2, '0')}`;
  const last = `${year}-${String(q * 3).padStart(2, '0')}`;
  return now > last ? 'done' : now >= first ? 'so-far' : 'future';
}

const inQuarter = (r: IndexRow, year: number, q: Quarter) => {
  const m = invoiceMonth(r);
  return m.startsWith(`${year}-`) && quarterOf(m) === q;
};

function sums(rows: IndexRow[], fx: Fx): TaxSums {
  let base = 0, vat = 0, irpf = 0, withholding = 0;
  for (const r of rows) {
    const { subtotal, currency, vatRate, irpfRate, withholdingRate } = r.invoice;
    if (subtotal == null) continue;
    const month = invoiceMonth(r);
    // Same rounding as the invoice itself (computeTotals), then to EUR at the invoice month's rate.
    const eur = (x: number) => convert(roundMoney(x, currency), currency, 'EUR', month, fx);
    base += eur(subtotal);
    vat += eur(subtotal * vatRate);
    irpf += eur(subtotal * irpfRate);
    withholding += eur(subtotal * withholdingRate);
  }
  const r = (x: number) => roundMoney(x, 'EUR');
  return { base: r(base), vat: r(vat), irpf: r(irpf), withholding: r(withholding) };
}

const quarterRow = (rows: IndexRow[], year: number, q: Quarter, today: string, fx: Fx): QuarterRow => ({
  year, q, due: dueDate(year, q), status: statusOf(year, q, today), ...sums(rows.filter((r) => inQuarter(r, year, q)), fx),
});

export function taxQuarters(rows: IndexRow[], year: number, today: string, fx: Fx): { quarters: QuarterRow[]; total: TaxSums; skipped: number } {
  const quarters = ([1, 2, 3, 4] as Quarter[]).map((q) => quarterRow(rows, year, q, today, fx));
  const add = (k: keyof TaxSums) => roundMoney(quarters.reduce((a, q) => a + q[k], 0), 'EUR');
  const skipped = rows.filter((r) => r.invoice.subtotal == null && invoiceMonth(r).startsWith(`${year}-`)).length;
  return { quarters, total: { base: add('base'), vat: add('vat'), irpf: add('irpf'), withholding: add('withholding') }, skipped };
}

/** The quarter whose filing deadline is today or the next one to come. */
export function nextFiling(rows: IndexRow[], today: string, fx: Fx): QuarterRow {
  const y = Number(today.slice(0, 4));
  const candidates: [number, Quarter][] = [[y - 1, 4], [y, 1], [y, 2], [y, 3], [y, 4]];
  const [year, q] = candidates.find(([cy, cq]) => dueDate(cy, cq) >= today)!; // [y, 4] is due next January, so one always matches
  return quarterRow(rows, year, q, today, fx);
}

export interface InstalmentRow {
  label: string;
  index: number;
  count: number;
  amount: number; // this payment, in the line's currency
  currency: LineCurrency;
  remaining: number; // after this payment
}

/** Instalments of the latest saved month (finished ones are gone by then, as carryForward drops them). */
export function instalmentsInProgress(months: MonthRecord[], lines: Line[]): InstalmentRow[] {
  const latest = months.map((m) => m.month).sort().at(-1);
  return lines
    .filter((l) => l.month === latest && l.kind === 'expense' && l.inst)
    .map((l) => ({
      label: l.label,
      index: l.inst!.index,
      count: l.inst!.count,
      amount: l.amount,
      currency: l.currency,
      remaining: Math.max(0, roundMoney(l.inst!.total - l.inst!.index * l.amount, l.currency)),
    }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboardTax.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/tax.ts tests/dashboardTax.test.ts
git commit -m "feat(dashboard): quarterly VAT/IRPF/withholding, next filing and instalments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tax section, "Next filing", and final verification (end of phase 3)

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes:
  - from Task 7: `taxQuarters`, `nextFiling`, `instalmentsInProgress`
  - from Task 2: `taxYearOf`, `dayMonth`, `money`
  - from Task 4: the `ui.tsx` blocks
- Produces: the finished page.

- [ ] **Step 1: Wire the tax data and the tile**

In `src/app/dashboard/page.tsx`:

1. Add `taxYearOf` to the `@/lib/dashboard/period` import and `dayMonth` to the `@/lib/dashboard/format` import, then add:

```tsx
import { instalmentsInProgress, nextFiling, taxQuarters } from '@/lib/dashboard/tax';
```

2. After the `household` constant, add:

```tsx
  const year = taxYearOf(period, now);
  const tax = taxQuarters(rows, year, today, fx);
  const next = nextFiling(rows, today, fx);
  const instalments = shared ? instalmentsInProgress(shared.months, shared.lines) : [];
```

3. Insert the third tile between `Unpaid` and `Transfer this month`:

```tsx
        <Stat
          label="Next filing"
          value={`Q${next.q} ${next.year}`}
          sub={`due ${dayMonth(next.due)} · VAT ${money(next.vat, 'EUR', true)} · IRPF ${money(next.irpf, 'EUR', true)}${next.status === 'so-far' ? ' so far' : ''}`}
        />
```

- [ ] **Step 2: Add the Tax section between Business and Household**

After the Business `</Section>` and before `<Section title="Household">`, add:

```tsx
      <Section title={`Tax ${year} · €`}>
        <Panel title="Quarters">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="eyebrow text-right text-foreground/50">
                <tr>
                  <th className="py-1.5 text-left font-bold">Quarter</th>
                  <th className="font-bold">Revenue base</th>
                  <th className="font-bold">VAT charged</th>
                  <th className="font-bold">IRPF withheld</th>
                  <th className="font-bold">Foreign withholding</th>
                  <th className="font-bold">Due</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {tax.quarters.map((q) => (
                  <tr key={q.q} className={`border-t border-foreground/10 ${q.status === 'future' ? 'text-foreground/40' : ''}`}>
                    <td className="py-1.5 text-left whitespace-nowrap">Q{q.q}{q.status === 'so-far' && <span className="text-foreground/50"> · so far</span>}</td>
                    <td>{money(q.base, 'EUR', true)}</td>
                    <td>{money(q.vat, 'EUR', true)}</td>
                    <td>{money(q.irpf, 'EUR', true)}</td>
                    <td>{money(q.withholding, 'EUR', true)}</td>
                    <td className="whitespace-nowrap">{dayMonth(q.due)}</td>
                  </tr>
                ))}
                <tr className="border-t border-foreground/30 font-bold">
                  <td className="py-1.5 text-left">{year}</td>
                  <td>{money(tax.total.base, 'EUR', true)}</td>
                  <td>{money(tax.total.vat, 'EUR', true)}</td>
                  <td>{money(tax.total.irpf, 'EUR', true)}</td>
                  <td>{money(tax.total.withholding, 'EUR', true)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-foreground/50">
            VAT charged feeds Modelo 303. IRPF withheld is subtracted in Modelo 130. Foreign withholding is a credit in the annual return.
            The Modelo 130 payment itself is not estimated: business expenses are not tracked here.
            {tax.skipped > 0 && ` ${plural(tax.skipped, 'invoice')} skipped (no subtotal).`}
          </p>
        </Panel>
        <Panel title="Instalments in progress">
          {!shared ? (
            <NotImported />
          ) : instalments.length ? (
            <ul className="space-y-3">
              {instalments.map((i) => (
                <li key={i.label} className="space-y-1 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <span>{i.label}</span>
                    <span className="text-xs tabular-nums text-foreground/60">
                      {i.index} of {i.count} · {money(i.amount, i.currency, true)} each · {money(i.remaining, i.currency, true)} left
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(i.index / i.count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No instalments running</Empty>
          )}
        </Panel>
      </Section>
```

- [ ] **Step 3: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: no errors, all tests pass, and the build succeeds with `/dashboard` listed as a dynamic route.

- [ ] **Step 4: Full manual check in `npm run dev`**

1. `/dashboard`:
   - four tiles;
   - "Next filing" reads `Q3 2026`, "due 20 Oct" (while today is before 21 Oct 2026);
   - the Tax table for 2026 has Q4 marked "so far".
2. Cross-check Q3 2026's VAT and IRPF against the invoice sheets of Jul–Sep 2026 by hand.
3. `/dashboard?p=2025`:
   - the Tax table switches to 2025, and every quarter is "done";
   - the revenue bars run Jan–Dec 2025.
4. `/dashboard?ccy=JPY`:
   - Business and Household switch to ¥;
   - the Tax table stays in €.
5. `/dashboard?p=1999&ccy=XYZ` falls back to "Last 12 months" and €.
6. Simulate the rate service being down:
   - temporarily change the host in `fetchMonthlyRates` to `api.frankfurter.invalid`;
   - reload: the amber "Exchange rates unavailable — converted amounts are approximate." banner shows and the figures still render;
   - revert the change.
7. Phone width (390px):
   - one column, no horizontal page scroll;
   - the tax table scrolls inside its card.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): Tax section and next filing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: README**

Add a short "Dashboard" section to `README.md`, after "Shared account (monthly transfer)":

```markdown
## Dashboard

`/dashboard` charts what the app already knows: revenue by client, unpaid invoices (since Jul 2025, from the shared
account's income lines), quarterly VAT / IRPF / foreign withholding for Modelo 303/130 prep, and the shared account's
transfers and expenses. Amounts in other currencies use each month's ECB average (frankfurter.dev, cached a day);
switch € / ¥ and the period at the top. Expense categories come from keyword rules in `src/lib/dashboard/household.ts`.
```

Commit:

```bash
git add README.md
git commit -m "docs: dashboard section in README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
