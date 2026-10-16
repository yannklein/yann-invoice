# Invest Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/invest` page. It tells Yann what to buy at each fixed buy date (buy-only rebalancing toward 55/20/25), projects the long game, and compares his money against lazy "legend" portfolios. The "Stock mix" Google Sheet is the database.

**Architecture:** The server page reads the app tabs of the linked "Stock mix" sheet. It fetches Yahoo daily prices and Frankfurter daily FX (both cached a day) and passes everything to pure, unit-tested functions in `src/lib/invest/`. Those return one view model. Thin client components draw the slider, the upload flow and the Recharts charts. IBKR Activity Statement CSVs are parsed in pure code and appended to the sheet through server actions.

**Tech Stack:** Next.js 16.3.8 (App Router, server actions), React 19.2.8, TypeScript, Tailwind v4, shadcn (`base-nova`), Recharts 3.8 via `src/components/ui/chart.tsx`, googleapis (Sheets v4 / Drive v3), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-17-invest-planner-design.md`. Read it first: the tab layouts, seed rows, benchmark weights and formulas live there and are not repeated here.

## Global Constraints

- **Next.js 16 is not the version you know.** Before writing pages, server actions or `fetch` caching, read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and the relevant API pages. Follow the patterns in use:
  - `searchParams: Promise<…>` awaited in the page
  - `'use server'` action files
  - `fetch(url, { next: { revalidate } })`

  Server action bodies are capped at 1MB, and statements are ~25KB, so no config change is needed.
- **No new dependencies.**
- **Pure modules** (`src/lib/invest/*.ts` except `store.ts`, and `src/lib/fx/history.ts`) never import Google, Next or React. Each one gets a Vitest file in `tests/` named `tests/invest<Module>.test.ts`. The alias `@` maps to `src`.
- **Money:** EUR is rounded to cents with `round2 = (x) => Math.round(x * 100) / 100` (exported from `src/lib/invest/types.ts`). Units are shown with 4 decimals. Formatting reuses `money()` / `compactMoney()` / `percent()` from `src/lib/dashboard/format.ts`, and `todayDate()` from `src/lib/dashboard/period.ts`.
- **The sheet is the only store.** The app writes only these tabs: `Trades, Deposits, Dividends, Cash, Snapshots, Plan, Slots, Symbols, Benchmarks` (`APP_TABS`). It never clears, deletes or writes any other tab, `Japan` and `IBKR` included. Defaults and seed rows are written **only into a tab the app has just created**.
- **External calls:**
  - Yahoo: `https://query1.finance.yahoo.com/v8/finance/chart/{yahoo}?period1={s}&period2={s}&interval=1d`, sent with header `User-Agent: Mozilla/5.0`, an 8s timeout and `next: { revalidate: 86400 }`.
  - Frankfurter: `https://api.frankfurter.dev/v1/{from}..{to}?from=EUR&to=JPY,USD`, with a 5s timeout and `next: { revalidate: 86400 }`.
- **No silent wrong numbers:**
  - A non-EUR row that can't be converted refuses the whole upload.
  - Stale prices are labelled.
  - Unparsed CSV rows are listed in the preview.
- **Theme:** the app is dark-only. Chart colours come from `--chart-1..5`, `--chart-other` and `--chart-muted`, never hex. Follow the chart rules of `docs/superpowers/plans/2026-10-12-dashboard.md` → Global Constraints: no second y-axis, 2px lines, a legend when there are two or more series, and text never in a series colour. "You" is always `--chart-1`. Benchmarks use `--chart-2..5`, then `--chart-other`.
- **Copy, verbatim:**
  - Stale price: `Price from {date} — live quote unavailable`
  - Benchmark weights: `Weights per book summary — edit in the Benchmarks tab`
  - Approximate history: `Before {exactFrom as D Mon YYYY}: from your sheet (approximate)`
  - Upload refused: `Exchange rates unavailable — nothing was imported. Try again later.`
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Work on a branch** `feat/invest-planner`, never on `main`.

## Review Focus

1. **Re-uploading the same statement, or an overlapping one (Jan–Oct, then Jan–Dec), must add zero duplicates.** That includes the three distinct €-deposits on 2026-06-30 and two identical same-day deposits, which must stay two rows. *(Task 6 tests `dedupes a second import` and `keeps identical same-day deposits apart`.)*
2. **A linked sheet whose app tabs already exist must not be overwritten when linked again.** Missing tabs are created with defaults; existing ones stay as they are. *(Task 2 test `defaultRowsFor only seeds missing tabs`.)*
3. **A Yahoo symbol that 404s, or returns 200 with `chart.result: null`, must show the stale label and the last trade price.** It must never be €0, and never be a missing holding. A benchmark with a dead leg holds that weight as cash. *(Task 5 test `returns null for unusable bodies`; Task 8 test `holds a leg without prices as cash`.)*
4. **Hand-edited sheet rows that don't parse** (a blank quantity, a typo'd date) are counted in `invalidRows` and shown as a warning. They are never treated as 0 or crash the page. *(Task 2 test `rejects malformed rows`.)*
5. **The empty states must render:**
   - a linked sheet with no trades
   - a portfolio with no flows (no simulation, no NaN)
   - a round amount of 0 or less (all buys 0)

   *(Task 4 test `rebalance with zero amount`; Task 8 test `no flows gives empty series`; Task 10 test `empty portfolio view`.)*

---

### Task 1: Daily ECB rates

**Files:**
- Modify: `src/lib/fx/history.ts` (append; keep the monthly helpers unchanged)
- Test: `tests/fxHistory.test.ts` (append a `describe` block per function)

**Interfaces:**
- Consumes: the existing `RateCurrency`.
- Produces:
  - `type DailyRates = Record<string /*YYYY-MM-DD*/, Partial<Record<RateCurrency, number>>>` (units per EUR)
  - `parseDailyRates(json: unknown): DailyRates`
  - `dailyRateFor(rates: DailyRates, date: string, c: RateCurrency): number | null`: the rate on `date`, else the closest earlier day, else null
  - `toEur(amount: number, currency: 'EUR' | RateCurrency, date: string, rates: DailyRates | null): number | null`: EUR passes through; otherwise `round2(amount / rate)`, or null
  - `fetchDailyRates(from: string, to: string): Promise<DailyRates | null>`: null on failure or an empty result

- [ ] **Step 1: Write the failing tests.**
  - `parseDailyRates`: keeps valid days, skips bad dates and non-positive rates, and returns `{}` for `null`, `{}`, `{rates:3}`.
  - `dailyRateFor({ '2026-07-03': { USD: 1.14 } }, '2026-07-05', 'USD')` returns `1.14` (a weekend gap), and `'2026-07-02'` returns `null`.
  - `toEur(26.03, 'USD', '2026-03-31', { '2026-03-31': { USD: 1.14 } })` returns `22.83`.
  - `toEur(5, 'EUR', 'x', null)` returns `5`.
  - `toEur(5, 'USD', '2026-01-01', null)` returns `null`.
  - `fetchDailyRates` returns `null` on a 500, on a throw, and on `{rates:{}}` (stub `fetch` with `vi.stubGlobal` as the existing monthly tests do).
- [ ] **Step 2:** Run `npx vitest run tests/fxHistory.test.ts`. Expected: the new tests FAIL (not exported).
- [ ] **Step 3:** Implement the four functions in `src/lib/fx/history.ts`, using the URL from Global Constraints.
- [ ] **Step 4:** Run `npx vitest run tests/fxHistory.test.ts`. Expected: all PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(fx): daily ECB rates"`, after `git checkout -b feat/invest-planner` and adding the spec, this plan and `tests/fixtures/ibkr-activity.csv` + `tests/fixtures/yahoo-chart.json` in this first commit.

---

### Task 2: Types, defaults and sheet rows

**Files:**
- Create: `src/lib/invest/types.ts`, `src/lib/invest/defaults.ts`, `src/lib/invest/rows.ts`
- Test: `tests/investRows.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Ccy = 'EUR' | 'USD' | 'JPY';
  export const round2: (x: number) => number;
  export interface Trade { key: string; date: string; account: string; symbol: string; isin: string; currency: Ccy; quantity: number; price: number; commission: number; amountEur: number; source: 'ibkr' | 'transfer' | 'manual'; note: string }
  export interface Deposit { key: string; date: string; currency: Ccy; amount: number; amountEur: number; source: 'ibkr' | 'sheet'; kind: 'new' | 'internal'; note: string }
  export interface Dividend { key: string; date: string; symbol: string; currency: Ccy; amount: number; amountEur: number }
  export interface CashRow { date: string; deposit: number; balance: number; note: string }
  export interface Snapshot { date: string; valueEur: number; note: string }
  export interface PlanSettings { buyMonths: number[]; perBuyEur: number; realReturnStocks: number; realReturnBonds: number; birthYear: number | null; internalBefore: string; exactFrom: string }
  export interface Slot { slot: string; kind: 'stocks' | 'bonds'; targetPct: number; holdSymbols: string[]; buySymbol: string; sriSymbol: string | null; livret: boolean }
  export interface SymbolInfo { symbol: string; isin: string; yahoo: string; name: string; terPct: number | null; sri: boolean }
  export interface BenchmarkLeg { benchmark: string; yahoo: string; weight: number; note: string }
  export interface Portfolio { trades: Trade[]; deposits: Deposit[]; dividends: Dividend[]; cash: CashRow[]; snapshots: Snapshot[]; plan: PlanSettings; slots: Slot[]; symbols: SymbolInfo[]; benchmarks: BenchmarkLeg[]; invalidRows: number }
  ```
- Produces (`rows.ts`):
  - `type AppTab = 'Trades' | 'Deposits' | 'Dividends' | 'Cash' | 'Snapshots' | 'Plan' | 'Slots' | 'Symbols' | 'Benchmarks'`
  - `APP_TABS: AppTab[]` (in that order)
  - `HEADERS: Record<AppTab, string[]>`, with columns exactly as in the spec table
  - `toRow.<tab>(x): (string | number)[]` and `fromRow.<tab>(cells: unknown[]): T | null`, one pair per row type. For `Plan`, these are `planFromRows(rows: unknown[][]): PlanSettings` (missing keys fall back to `DEFAULT_PLAN`) and `planToRows(p: PlanSettings): (string|number)[][]`.
  - `parsePortfolio(raw: Record<AppTab, unknown[][]>): Portfolio`: skips blank rows and counts rows that fail to parse in `invalidRows`
- Produces (`defaults.ts`):
  - `DEFAULT_PLAN`, `DEFAULT_SLOTS`, `DEFAULT_SYMBOLS`, `DEFAULT_BENCHMARKS`, `SEED_DEPOSITS`, `SEED_SNAPSHOTS`, `SEED_CASH`, with the values from the spec's "Sheet tabs", "Seed rows" and "Benchmarks" sections
  - `defaultRowsFor(tab: AppTab): (string|number)[][]`: data rows only, no header

- [ ] **Step 1: Write the failing tests.**
  - **Round-trips:** `fromRow.trades(toRow.trades(t))` equals `t` for each row type. The `Slots` round-trip preserves `holdSymbols: ['IWRD','2B7K']`, and `sriSymbol` `''` becomes `null`.
  - **`rejects malformed rows`:**
    - a trade with a blank quantity → `null`
    - a date `2026-13-01` → `null`
    - an unknown currency `GBP` → `null`
    - `parsePortfolio` with one good and one bad trade row → 1 trade, `invalidRows: 1`
  - **Plan fallback:** `planFromRows([['perBuyEur', 7000]])` gives `perBuyEur: 7000` and `buyMonths: [1, 7]`.
  - **Defaults:**
    - `DEFAULT_BENCHMARKS` sums to 100 per benchmark.
    - `SEED_DEPOSITS` has 5 rows, all `kind: 'new'`, with EUR `[8422.23, 7635.53, 7676.07, 6132.71, 4445.76]` (sum 34312.30).
    - `SEED_SNAPSHOTS` values are `[8422.23, 15888.33, 23228.73, 33592.74]`.
    - `SEED_CASH[0]` is `{ date: '2026-07-05', deposit: 0, balance: 4559.7 }`.
    - `DEFAULT_PLAN` has `internalBefore: '2026-07-06'` and `exactFrom: '2026-07-05'`.
  - **`defaultRowsFor only seeds missing tabs`:**
    - `defaultRowsFor('Trades')` is `[]`
    - `defaultRowsFor('Deposits')` has 5 rows with source `sheet`
    - `defaultRowsFor('Slots')` has 3 rows
- [ ] **Step 2:** Run `npx vitest run tests/investRows.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three files. Dates match `/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/`. Lists are comma-separated in cells. `sri` and `livret` are `y`/`n`. Follow the `str`/`num` helpers of `src/lib/shared/rows.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/investRows.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): types, defaults and sheet rows"`.

---

### Task 3: IBKR Activity Statement parser

**Files:**
- Create: `src/lib/invest/ibkr.ts`
- Test: `tests/investIbkr.test.ts` (reads `tests/fixtures/ibkr-activity.csv` with `fs.readFileSync`)

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedStatement {
    account: string; period: { from: string; to: string } | null;
    trades: { dateTime: string; date: string; symbol: string; currency: Ccy; quantity: number; price: number; proceeds: number; commission: number }[]; // commission ≥ 0
    transfers: { date: string; symbol: string; currency: Ccy; quantity: number; marketValue: number; counterparty: string }[]; // quantity < 0 for Out
    deposits: { date: string; currency: Ccy; amount: number; description: string }[];
    dividends: { date: string; symbol: string; isin: string; currency: Ccy; amount: number }[];
    conversions: number;                       // Forex (e.g. EUR.USD AutoFX) trades: counted, not imported
    instruments: Record<string, { isin: string; exchange: string; name: string }>;
    endingPositions: Record<string, number>;
    endingCashEur: number | null;              // Forex Balances → Total → "Value in EUR"
    skipped: string[];                         // raw Data lines of a handled section that failed to parse
  }
  export function splitCsvLine(line: string): string[];
  export function parseIbkrCsv(text: string): ParsedStatement;
  ```

- [ ] **Step 1: Write the failing tests** against the fixture.
  - **Account and period:** `account === 'U0000001'`; `period` is `{ from: '2026-01-01', to: '2026-10-15' }`.
  - **Stock trades:** `trades` has length 2.
    - `trades[0]` matches `{ date: '2026-02-04', symbol: 'CSBGE3', quantity: 66, price: 116.23, proceeds: -7671.18, commission: 3.83559 }`.
    - `trades[1]` matches `{ date: '2026-07-06', symbol: 'IWRD', quantity: 57.4462, proceeds: -5198.9911, commission: 3 }`.
  - **Forex:** `conversions === 3`. The Forex rows use the **second** `Trades,Header` line's columns, and none of them are in `trades`.
  - **Transfers:** `transfers` matches `[{ date: '2026-01-27', symbol: 'IMEU', quantity: 158.3901, marketValue: 5988.73, counterparty: 'U0000002' }, { symbol: 'IWRD', quantity: 198.6907, marketValue: 16144.41 }]`. Note the quoted `"5,988.73"`.
  - **Deposits:** length 7, summing to 12700; three rows dated `2026-06-30`.
  - **Dividends:** length 6.
    - `dividends[0]` matches `{ date: '2026-02-27', symbol: 'IMEU', isin: 'IE00B1YZSC51', currency: 'EUR', amount: 15.32 }`.
    - `dividends[3]` matches `{ symbol: 'IWRD', currency: 'USD', amount: 26.03 }`.
    - The `Total` / `Total in EUR` rows are not included.
  - **Positions, cash and instruments:** `endingPositions` equals `{ CSBGE3: 66, IMEU: 158.3901, IWRD: 256.1369 }`; `endingCashEur` is close to `91.2073`; `instruments.CSBGE3` matches `{ isin: 'IE00B3VTMJ91', exchange: 'EBS' }`; `skipped` is `[]`.
  - **`splitCsvLine`:** `'a,"b, c",,"x ""y"""'` gives `['a','b, c','','x "y"']`.
  - **Bad rows:** a statement with one corrupt Trades Data line (quantity `abc`) lists it in `skipped`. An empty string returns empty arrays, `account: ''` and `period: null`.
- [ ] **Step 2:** Run `npx vitest run tests/investIbkr.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Split lines on `\r?\n`. Column 0 is the section and column 1 the row type: `Header` resets that section's column map, while `Data` / `SubTotal` / `Total` are rows. Only `Data` rows are used, and they are read by header name.
  - **Trades:** a row with `Asset Category = Forex` counts as a conversion.
  - **Dividends:** the `Description` looks like `IMEU(IE00B1YZSC51) Cash Dividend …`. Skip rows whose `Currency` starts with `Total`.
  - **Transfers:** `Direction = Out` negates the quantity.
  - **Numbers:** strip thousands commas.
  - **Period:** `"January 1, 2026 - October 15, 2026"` is converted with a month-name map, never `Date` parsing in local time.
- [ ] **Step 4:** Run `npx vitest run tests/investIbkr.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): IBKR activity statement parser"`.

---

### Task 4: Holdings, cash, rebalance and schedule

**Files:**
- Create: `src/lib/invest/holdings.ts`
- Test: `tests/investHoldings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function holdings(trades: Trade[], until?: string): Record<string, number>;   // net qty per symbol, zero positions dropped, 1e-9 tolerance
  export function ibkrCashEur(p: Pick<Portfolio, 'trades' | 'deposits' | 'dividends'>, until?: string): number; // spec "IBKR cash"
  export function livretOn(cash: CashRow[], date: string): number;                    // latest balance on/before date, else 0
  export interface SlotValue { slot: string; kind: 'stocks' | 'bonds'; weight: number; valueEur: number }
  export function slotValues(slots: Slot[], values: Record<string, number> /* EUR per symbol */, livret: number): { slots: SlotValue[]; unassigned: string[] };
  export function rebalance(slots: SlotValue[], amount: number): { slot: string; buyEur: number }[];
  export function nextBuyDate(today: string, buyMonths: number[]): { date: string; days: number } | null;
  ```

- [ ] **Step 1: Write the failing tests.**
  - **`holdings`:** on inline trades (IMEU transfer 158.3901 and IWRD transfer 198.6907 on 2026-01-27, CSBGE3 buy 66 on 2026-02-04, IWRD buy 57.4462 on 2026-07-06) it equals `{ CSBGE3: 66, IMEU: 158.3901, IWRD: 256.1369 }`, and `holdings(trades, '2026-03-01')` gives IWRD `198.6907`.
  - **`ibkrCashEur`:** for deposits 12700 (ibkr) plus a 4445.76 `sheet` deposit, trades 7675.02 + 5201.99 (ibkr) plus a transfer of 22133.14, and dividends summing 267.87, it is `90.86`. Sheet deposits and transfers are ignored.
  - **`rebalance`:**
    - Weights 55/20/25 with values `[24005.15, 6322.93, 12234.84]` and amount 5000 → `[2015.73, 2984.27, 0]`.
    - `[50,30,20]` on target with amount 100 → `[50,30,20]`.
    - `[100,0,0]` with weights `.5/.25/.25` and amount 100 → `[0,50,50]`.
    - `[0,0,100]` with amount 40 → `[26.67,13.33,0]`.
    - **`rebalance with zero amount`:** amount 0 or −5 → all `0`.
  - **`slotValues`:** the Bonds slot with `livret: true` adds the livret. A symbol in values but in no slot is listed in `unassigned`.
  - **`nextBuyDate`:**
    - `('2026-10-17', [1,7])` → `{ date: '2027-01-01', days: 76 }`
    - `('2026-07-01', [1,7])` → days 0
    - `('2026-07-02', [7])` → `2027-07-01`
    - `[]` → null
- [ ] **Step 2:** Run `npx vitest run tests/investHoldings.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `holdings.ts`. Rebalance follows the spec formula, and each buy is rounded with `round2`.
- [ ] **Step 4:** Run `npx vitest run tests/investHoldings.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): holdings, cash, buy-only rebalance, next buy date"`.

---

### Task 5: Yahoo prices

**Files:**
- Create: `src/lib/invest/prices.ts`
- Test: `tests/investPrices.test.ts` (uses `tests/fixtures/yahoo-chart.json`: CSBGE3.SW, 3 days, the middle one null)

**Interfaces:**
- Produces:
  ```ts
  export interface PricePoint { date: string; close: number; adj: number }
  export interface PriceSeries { yahoo: string; currency: string; points: PricePoint[] } // ascending, no nulls
  export function parseYahooChart(json: unknown): PriceSeries | null;
  export function priceOn(s: PriceSeries | null | undefined, date: string, field?: 'close' | 'adj'): number | null; // last point on/before date
  export function fetchSeries(yahoo: string, from: string, to: string): Promise<PriceSeries | null>;
  ```
- The date is the timestamp plus `meta.gmtoffset`, formatted as UTC `YYYY-MM-DD`. If `adjclose` is missing, `adj` equals `close`.

- [ ] **Step 1: Write the failing tests.**
  - **Fixture parse:** `parseYahooChart(fixture)` gives `{ yahoo: 'CSBGE3.SW', currency: 'EUR', points: [{ date: '2025-10-01', close: 115.39…, adj: … }, { date: '2025-10-03', … }] }`. There are 2 points, and the null day is dropped.
  - **`returns null for unusable bodies`:** `null`, `{}`, `{ chart: { result: null, error: {…} } }` and `{ chart: { result: [{ meta: {}, timestamp: [] }] } }` all give `null`.
  - **`priceOn`:** `'2025-10-02'` gives the 10-01 close; `'2025-09-30'` gives `null`; `'2026-01-01'` gives the last close.
  - **`fetchSeries`:** returns null on a 404 and on a throw. Stub `fetch`, and assert the URL contains `period1=` and the `User-Agent` header.
- [ ] **Step 2:** Run `npx vitest run tests/investPrices.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `prices.ts`, using the URL, timeout and cache from Global Constraints.
- [ ] **Step 4:** Run `npx vitest run tests/investPrices.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): Yahoo daily price series"`.

---

### Task 6: Import merge, EUR conversion and reconciliation

**Files:**
- Create: `src/lib/invest/importPlan.ts`
- Test: `tests/investImport.test.ts`

**Interfaces:**
- Consumes: `ParsedStatement` (Task 3), `DailyRates` / `toEur` (Task 1), the types and `DEFAULT_SYMBOLS` (Task 2), and `holdings` / `ibkrCashEur` (Task 4).
- Produces:
  ```ts
  export interface ImportResult {
    trades: Trade[]; deposits: Deposit[]; dividends: Dividend[];   // NEW rows only
    duplicates: { trades: number; deposits: number; dividends: number };
    newSymbols: SymbolInfo[];        // instruments not yet in Symbols; yahoo/ter/sri copied from DEFAULT_SYMBOLS by ISIN, else yahoo ''
    positionMismatches: { symbol: string; sheet: number; statement: number }[];
    cashDiffEur: number | null;      // ibkrCashEur(after merge) − endingCashEur
    missingRates: boolean;           // some non-EUR row could not be converted → caller must refuse the upload
    conversions: number; skipped: string[]; period: { from: string; to: string } | null;
  }
  export function buildImport(stmt: ParsedStatement, existing: Pick<Portfolio, 'trades' | 'deposits' | 'dividends' | 'symbols' | 'plan'>, rates: DailyRates | null): ImportResult;
// each imported deposit: kind = date < existing.plan.internalBefore ? 'internal' : 'new'
  ```
- Keys (stable across overlapping statements):
  - trade: `${account}|${dateTime}|${symbol}|${quantity}`
  - transfer: `${account}|xfer|${date}|${symbol}|${quantity}`
  - deposit: `${account}|dep|${date}|${currency}|${amount}|${n}`, where `n` is the 0-based occurrence of that same date/currency/amount within the statement
  - dividend: `${account}|div|${date}|${symbol}|${currency}`
- `amountEur`:
  - trade: `round2((-proceeds + commission) / rate)`
  - transfer: `marketValue` (source `transfer`, price `round(marketValue/quantity, 6)`, commission 0)

- [ ] **Step 1: Write the failing tests.** Use the parsed fixture with `rates = { '2026-03-31': { USD: 1.14 }, '2026-06-30': { USD: 1.14 }, '2026-09-30': { USD: 1.14 } }` and an empty `existing`, except for `symbols: DEFAULT_SYMBOLS` and `plan: DEFAULT_PLAN`.
  - **Counts:** 4 trades (2 ibkr + 2 transfer), 7 deposits, 6 dividends; `missingRates: false`; `conversions: 3`.
  - **Deposit kinds:** all 7 deposits are `kind: 'internal'` (before 2026-07-06). With `plan.internalBefore = '2026-06-01'`, the three 2026-06-30 deposits are `new`.
  - **CSBGE3 trade:** `amountEur === 7675.02`, `source: 'ibkr'`, `isin: 'IE00B3VTMJ91'`.
  - **IWRD trade:** `amountEur === 5201.99`.
  - **Transfers:** IMEU transfer `amountEur === 5988.73`, `source: 'transfer'`.
  - **USD dividends:** EUR amounts are `[22.83, 74.49, 34.67]`.
  - **Reconciliation:** `positionMismatches` is `[]`; `Math.abs(cashDiffEur!) < 5` (≈ −0.35).
  - **`dedupes a second import`:** `buildImport(stmt, { ...merged }, rates)` returns 0 new rows of each kind, and duplicates are `{ trades: 4, deposits: 7, dividends: 6 }`.
  - **`keeps identical same-day deposits apart`:** a statement with two `EUR 2026-06-30 300` deposits yields 2 deposits with different keys.
  - **Missing rates:** `rates = null` gives `missingRates: true`. The EUR rows still convert.
  - **Mismatch:** `existing.trades` holding an extra 1 IWRD gives `positionMismatches` = `[{ symbol: 'IWRD', sheet: 257.1369, statement: 256.1369 }]`.
- [ ] **Step 2:** Run `npx vitest run tests/investImport.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `buildImport` in `src/lib/invest/importPlan.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/investImport.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): import merge with dedupe and reconciliation"`.

---

### Task 7: Projection

**Files:**
- Create: `src/lib/invest/projection.ts`
- Test: `tests/investProjection.test.ts`

**Interfaces:**
- Produces:
  - `blendedReturn(slots: Pick<Slot,'kind'|'targetPct'>[], rStocks: number, rBonds: number): number`
  - `project(o: { startEur: number; perBuyEur: number; buysPerYear: number; realReturn: number }, years: number[]): { years: number; valueEur: number }[]`, with values rounded to whole euros
  - `buffettHorizon(birthYear: number | null, today: string): number | null`: `96 − age`, or null if no birth year or the result is ≤ 0

- [ ] **Step 1: Write the failing tests.**
  - `blendedReturn(defaultSlots, .05, .01)` is close to `0.04`.
  - `project({ startEur: 0, perBuyEur: 1000, buysPerYear: 1, realReturn: 0 }, [10])` gives `[{ years: 10, valueEur: 10000 }]`.
  - the same with `startEur: 10000, realReturn: .04` gives `26809` (26808.55).
  - `startEur: 0, buysPerYear: 2, realReturn: .04` gives `24250` (24249.98).
  - `project` with `buysPerYear: 0` treats it as 1.
  - `buffettHorizon(1985, '2026-10-17')` is `55`; `buffettHorizon(null, …)` is `null`.
- [ ] **Step 2:** Run `npx vitest run tests/investProjection.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the spec formula (contribution at the end of each period).
- [ ] **Step 4:** Run `npx vitest run tests/investProjection.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): real-euro projection"`.

---

### Task 8: Benchmark and "You" simulation

**Files:**
- Create: `src/lib/invest/simulate.ts`
- Test: `tests/investSimulate.test.ts`

**Interfaces:**
- Consumes: `PriceSeries` / `priceOn` (Task 5), and `holdings` / `ibkrCashEur` / `livretOn` (Task 4).
- Produces:
  ```ts
  export interface Flow { date: string; amountEur: number }
  export interface SeriesPoint { date: string; value: number }
  export type EurSeries = Record<string /*yahoo*/, PriceSeries>;  // already converted to EUR by the caller
  export function flowsOf(p: Pick<Portfolio, 'deposits' | 'cash'>): Flow[];   // kind=new deposits ∪ non-zero Cash.deposit, sorted, same-day summed
  export function weeklyDates(from: string, to: string): string[];           // from, +7d…, always ends with `to`
  export function simulateBenchmark(legs: { yahoo: string; weight: number }[], flows: Flow[], prices: EurSeries, dates: string[]): SeriesPoint[];
  export function youSeries(p: Portfolio, prices: Record<string /*symbol*/, PriceSeries | null>, dates: string[]): { points: (SeriesPoint & { approx: boolean })[] };
  ```
- `youSeries`:
  - Before `p.plan.exactFrom`, points come from linear interpolation between `snapshots` and the exact value on `exactFrom`, and are marked `approx: true`. Dates before the first snapshot are dropped.
  - From `exactFrom` on, the value is `Σ holdings(trades, d) × priceOn(close)`, plus `ibkrCashEur(p, d)`, plus `livretOn(cash, d)`.
  - A missing price for a held symbol falls back to that symbol's last trade price on or before `d`.

- [ ] **Step 1: Write the failing tests** with hand-built series.
  - **One leg, A at weight 1:** A's adj is 10 on 01-01 and 20 from 02-01. With flows of 100 on 01-01 and 02-01, and dates `['2026-01-01','2026-02-01','2026-03-01']`, the values are `[100, 300, 300]`.
  - **Two legs at 50/50 (A as above, B constant 10):** the values are `[100, 250, 250]` (rebalance on 02-01: 6.25 A + 12.5 B).
  - **`holds a leg without prices as cash`:** leg C has no points before 02-01. At 01-01 its 50% stays as cash at value 50; on 02-01 the cash is invested at the rebalance.
  - **`no flows gives empty series`:** `simulateBenchmark(legs, [], prices, dates)` returns `[]`, and so does `youSeries` with no trades and no snapshots. No NaN anywhere.
  - **`flowsOf`:** with the seed deposits, the fixture's 7 internal deposits and the seed Cash row, it returns exactly the 5 seed flows summing to 34312.30. Two `new` deposits on the same day merge, and a Cash row with `deposit: 50` adds a flow.
  - **`weeklyDates('2026-01-01','2026-01-20')`** is `['2026-01-01','2026-01-08','2026-01-15','2026-01-20']`.
  - **`youSeries`:**
    - Snapshots 01-01 100 and 01-15 200, with `exactFrom: '2026-02-01'`: the 01-08 point is `{ value: 150, approx: true }`.
    - On and after 02-01, 10 units at close 5 plus cash 3 gives 53, `approx: false`. A 01-22 point interpolates between 200 (01-15) and 53 (02-01).
- [ ] **Step 2:** Run `npx vitest run tests/investSimulate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `simulate.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/investSimulate.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): same-euros-same-dates simulation"`.

---

### Task 9: Quips and badges

**Files:**
- Create: `src/lib/invest/quips.ts`
- Test: `tests/investQuips.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface QuipContext { today: string; youValue: number; invested: number; lastTradeDate: string | null; driftPts: number[]; boughtInDrawdown: boolean; projection40: number; buffettAgeValue: number | null; buffettAge: number | null; legends: { name: string; value: number }[] }
  export interface Badge { id: 'sloth' | 'bullseye' | 'diamond' | 'compound'; emoji: string; label: string; earned: boolean; hint: string }
  export function lazyStreak(today: string, lastTradeDate: string | null): number | null;
  export function badges(c: QuipContext): Badge[];                       // always 4, fixed order
  export function quips(c: QuipContext): string[];                       // 2–4, deterministic per `today`
  export function scoreboardQuip(name: string, diffVsYou: number): string; // diff = legend − you
  export const CHERRY_COKE_EUR = 1.2;
  ```
- The thresholds come from the spec's "Badges". The wording is left to the builder: playful, Buffett-centric, and never advice to trade. There are at least 8 quip templates fed by the context: Cherry Cokes for a Buffett gap, the lazy streak, the Buffett-age projection, the "invested vs value" gain, the 40-year projection, and so on. Templates whose data is null are skipped.

- [ ] **Step 1: Write the failing tests.**
  - `lazyStreak('2027-01-05','2026-07-06')` is `183`, and with `null` it is `null`.
  - `badges`:
    - sloth is earned at 183 days and not at 100
    - bullseye is earned when every `driftPts` value is ≤ 2
    - diamond equals `boughtInDrawdown`
    - compound is earned when `projection40 ≥ 1_000_000`
  - `quips(c)` returns 2 to 4 strings. It is equal for the same `today` and contains no `NaN`/`undefined`. With `buffettAgeValue: null`, no string contains `Buffett's age`.
  - `scoreboardQuip('Buffett 90/10', 312)` contains `€312` and `260` (cans). A negative diff gives a different template than a positive one.
- [ ] **Step 2:** Run `npx vitest run tests/investQuips.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `quips.ts`. The rotation is seeded by the day number of `today`.
- [ ] **Step 4:** Run `npx vitest run tests/investQuips.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): quips and badges"`.

---

### Task 10: View model

**Files:**
- Create: `src/lib/invest/view.ts`
- Test: `tests/investView.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces:
  ```ts
  export interface Quote { symbol: string; priceEur: number; date: string; stale: boolean }
  export interface InvestView {
    today: string; nextBuy: { date: string; days: number } | null; lazyDays: number | null; badges: Badge[]; quips: string[];
    valueEur: number; investedEur: number; ibkrCashEur: number; livretEur: number;
    round: { amountEur: number; fromCashEur: number; lines: { slot: string; nowPct: number; targetPct: number; buyEur: number; symbol: string; units: number | null; stale: boolean }[]; driftNote: boolean };
    unassigned: string[]; quotes: Quote[];
    sri: { slot: string; current: SymbolInfo | null; candidate: SymbolInfo | null; usingSri: boolean }[]; sriSharePct: number;
    longGame: { perBuyEur: number; buysPerYear: number; realReturn: number; startEur: number; buffettYears: number | null };
    legends: { name: string; note: string; points: SeriesPoint[]; valueEur: number | null; diffVsYou: number | null; quip: string }[];
    you: (SeriesPoint & { approx: boolean })[];
    trades: Trade[]; invalidRows: number; missingSeries: string[];
  }
  export function buildView(p: Portfolio, series: Record<string /*yahoo*/, PriceSeries | null>, rates: DailyRates | null, today: string, amountOverride: number | null): InvestView;
  ```
- `buildView` converts USD/JPY series to EUR with `dailyRateFor` per point before calling Task 8. `longGame` hands raw inputs to the client slider, which calls `project` itself, so `projection.ts` must stay client-safe (pure).

- [ ] **Step 1: Write the failing tests.**
  - **Small portfolio:** the default slots and symbols, 10 IWRD + 10 IMEU + 10 CSBGE3 trades, a series of 3 points per yahoo symbol, `today = '2026-10-17'`, and `amountOverride = 1000`:
    - `round.amountEur === 1000`
    - Σ `lines.buyEur` is 1000 (±0.01)
    - `nextBuy.date === '2027-01-01'`
    - each line's `units === round(buyEur / priceEur, 4)`
  - **Stale quote:** a `null` series for `IMEU.AS` marks that quote `stale: true`, with the price from the last trade, and lists `IMEU.AS` in `missingSeries`.
  - **SRI share:** with `holdSymbols` World = `IWRD,2B7K` and some 2B7K units, `sriSharePct > 0` and `sri[0].usingSri` follows `buySymbol === sriSymbol`.
  - **`empty portfolio view`:** no trades, deposits, snapshots or series; `valueEur === 0`; `legends` all have `points: []` and `valueEur: null`; `you: []`; no NaN anywhere: a recursive `allFinite(view)` helper in the test asserts every number in the view is finite.
- [ ] **Step 2:** Run `npx vitest run tests/investView.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `view.ts`. The amount defaults to `perBuyEur + ibkrCashEur`, and `fromCashEur` is the cash part.
- [ ] **Step 4:** Run `npx vitest run` (the whole suite). Expected: all PASS.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): view model"`.

---

### Task 11: Sheet store, Drive role and Settings link

**Files:**
- Modify: `src/lib/google/drive.ts`. Add `'portfolio'` to `Role`.
- Create: `src/lib/invest/store.ts`
- Create: `src/app/settings/PortfolioLinkCard.tsx`
- Modify: `src/app/settings/actions.ts` (add `linkPortfolioAction`)
- Modify: `src/app/settings/page.tsx` (render the card after `SharedImportCard`, with a `portfolioError` search param)

**Interfaces:**
- Produces (`store.ts`):
  ```ts
  export const findPortfolioId: (drive: drive_v3.Drive) => Promise<string | null>;  // findByRole(drive, 'portfolio')
  export function readPortfolio(sheets: sheets_v4.Sheets, id: string): Promise<Portfolio>;  // one values.batchGet over APP_TABS (A2:Z), UNFORMATTED_VALUE → parsePortfolio
  export function linkPortfolio(g: Google, id: string): Promise<{ created: AppTab[] }>;    // addSheet for missing APP_TABS, write HEADERS + defaultRowsFor only into created tabs, move the role tag
  export function appendImport(sheets: sheets_v4.Sheets, id: string, r: ImportResult): Promise<void>; // one values.batchUpdate: rows written after the current last row of Trades/Deposits/Dividends/Symbols
  export function savePlanValue(sheets: sheets_v4.Sheets, id: string, key: keyof PlanSettings, value: string | number): Promise<void>;
  export function useSriForSlot(sheets: sheets_v4.Sheets, id: string, slot: string): Promise<void>; // buySymbol := sriSymbol, add it to holdSymbols
  export function addCashRow(sheets: sheets_v4.Sheets, id: string, row: CashRow): Promise<void>;
  ```
- The role tag is moved like `runImport` in `src/lib/shared/store.ts`: clear `'portfolio'` on other files, then set it on `id`. Unlike `runImport`, the store **never calls `batchClear`**.
- `appendImport` reads the current raw row counts (`values.get` on column A of each tab) and writes at `Tab!A{count+2}`.

- [ ] **Step 1:** Implement `store.ts` and the Drive role. There are no unit tests (Google I/O; the logic lives in the tested pure modules). Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 2:** Implement `linkPortfolioAction(formData)`, which reuses `parseSheetId`. On a bad id it redirects to `/settings?portfolioError=1#portfolio`. Otherwise it calls `linkPortfolio`, runs `revalidatePath('/invest')` and redirects to `/invest`.
- [ ] **Step 3:** Implement `PortfolioLinkCard` (`id="portfolio"`), modelled on `SharedImportCard` but with no preview step.
  - It shows the linked sheet with "Open sheet ↗", or the text: `Link "Stock mix": the app adds its own tabs (Trades, Deposits, …) and never changes your existing tabs.`
  - It has a URL input and a **Link** button.
- [ ] **Step 4:** Run `npm run lint && npx tsc --noEmit`. Expected: clean.
- [ ] **Step 5:** Commit with `git commit -m "feat(invest): portfolio sheet store and Settings link"`.

---

### Task 12: `/invest` page, actions, components and nav

**Files:**
- Create:
  - `src/app/invest/page.tsx`
  - `src/app/invest/actions.ts`
  - `src/app/invest/UploadCard.tsx`
  - `src/app/invest/LongGame.tsx`
  - `src/app/invest/SriCard.tsx`
  - `src/app/invest/charts/LegendsChart.tsx`
  - `src/app/invest/charts/HistoryChart.tsx`
- Modify: `src/app/layout.tsx`. Add `<Link href="/invest" className={navLink}>Invest</Link>` after Shared account.

**Interfaces:**
- Consumes: `buildView` (Task 10), the `store.ts` functions (Task 11), `parseIbkrCsv` (Task 3), `buildImport` (Task 4), `fetchSeries` (Task 5), `fetchDailyRates` (Task 1), `project` (Task 7), and `Section` / `Panel` / `Stat` / `Empty` (`src/app/dashboard/ui.tsx`).
- Actions (`'use server'`), each calling `getGoogle()` + `findPortfolioId`:
  - `previewUploadAction(csv: string): Promise<UploadPreview | { error: string }>`. Here `UploadPreview` is `ImportResult` with its row arrays replaced by counts.
  - `confirmUploadAction(csv: string): Promise<{ ok: true; added: number } | { error: string }>`. It re-parses, re-reads the portfolio, rebuilds the import, refuses when `missingRates` (using the Global Constraints copy), then calls `appendImport` and `revalidatePath('/invest')`.
  - `savePerBuyAction(amount: number)`: clamps to 0–30000 and calls `savePlanValue('perBuyEur')`.
  - `useSriAction(slot: string)`
  - `addCashAction(formData)`: takes the date and balance; the deposit is 0 unless filled.
- Page (server):
  1. Read `?amount=`.
  2. Get `findPortfolioId`. If it's null, render a Panel that links to `/settings#portfolio`.
  3. Run `readPortfolio`.
  4. Collect yahoo symbols from `symbols` (held ones and SRI candidates) plus `benchmarks`.
  5. Fetch in parallel: `fetchSeries(y, firstFlowDate − 7d, today)` for each symbol, and `fetchDailyRates(firstFlowDate, today)`.
  6. Call `buildView` and render the layout from the spec's "Page" section.

  A `Stat` row shows Value, Invested, Gain and IBKR cash. `invalidRows > 0` and `unassigned` show warnings. Stale quotes show the stale copy.
- `LongGame` (client) is a range input (€0–30000, step 250). It shows the four horizons plus the Buffett horizon from `project(...)`, and a **Save as plan** button calling `savePerBuyAction` inside `useTransition`.
- `UploadCard` (client):
  - The input is `<input type="file" accept=".csv">`. The file is read with `await file.text()` and kept in state.
  - **Preview** shows the counts (new/duplicate), the period, the conversions ignored, the skipped lines, position mismatches and the cash difference. It warns when `|cashDiffEur| ≥ 5`.
  - **Confirm** calls `confirmUploadAction`, then `router.refresh()`.
- `LegendsChart`: a Recharts `LineChart` with one line per legend plus "You". The approximate part of "You" is a separate dashed series (`strokeDasharray="4 4"`) with the approximate-history copy. Weekly x-axis with `dayMonth` labels; y-axis `compactMoney(…, 'EUR')`. The scoreboard under it is a table (legend, value, € vs You, quip) with the benchmark-weights copy.
- `HistoryChart`: the "You" area or line, plus a trades table (date, symbol, units, € amount, source) and the Livret Bleu form.

- [ ] **Step 1:** Implement the actions and the page, then the client components, then the nav link.
- [ ] **Step 2:** Run `npm run lint && npx tsc --noEmit && npm test && npm run build`. Expected: all clean and passing.
- [ ] **Step 3:** Commit with `git commit -m "feat(invest): /invest page with buy round, long game, legends and history"`.

---

### Task 13: End-to-end check in the real app

**Files:** none, unless fixes are needed. Commit any fixes with tests in the module that owns them.

- [ ] **Step 1:** Run `npm run dev`. Sign in, open `/settings`, and link `https://docs.google.com/spreadsheets/d/1RTPAEPGPsWahqi_GzmnLPNQ3GmEBcP6kQR9Wy1Vu8CM/edit`. Expected: you land on `/invest`. In Sheets, the 9 app tabs exist with seed rows, and `Japan`/`IBKR` are unchanged (compare cell A1:AA24 / A1:Z8 values before and after).
- [ ] **Step 2:** Upload Yann's real statement `U23805426_20260101_20261015.csv` (ask Yann for the file path). Expected preview: 4 trades, 7 deposits (all internal), 6 dividends new, 3 conversions ignored, no mismatches, and a cash difference under €5. After Confirm, the rows are in the tabs. Expected re-upload preview: 0 new, with all duplicates counted.
- [ ] **Step 3:** On `/invest`, check:
  - holdings IWRD 256.1369 / IMEU 158.3901 / CSBGE3 66
  - IBKR cash ≈ €91
  - value ≈ €38.1k + Livret Bleu €4.56k at current prices
  - the trades table shows €7,675.02 and €5,201.99
  - the legends start on 1 Dec 2022, "Invested" ≈ €34,312, and "You" is dashed before 5 Jul 2026
- [ ] **Step 4:** Move the slider, then Save. Expected: `Plan` perBuyEur updates and the round amount changes. Then "Use for new buys" on World. Expected: `Slots` World `buySymbol=2B7K` and the round line shows 2B7K. Revert it in the sheet afterwards if Yann prefers.
- [ ] **Step 5:** Temporarily set IMEU's yahoo to `NOPE.XX` in `Symbols`. Expected: the stale label shows and the value doesn't drop to 0. Then restore `IMEU.AS`.
- [ ] **Step 6:** Check the page at a 390px viewport: no horizontal scroll, and the charts stay readable.
- [ ] **Step 7:** Use superpowers:finishing-a-development-branch.
