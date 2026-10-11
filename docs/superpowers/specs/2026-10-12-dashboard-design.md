# Dashboard — business, tax and household charts

## Context

The app holds two kinds of data that are never shown as a whole:

- **Invoice Index:** every invoice with number (`YYYYMMNNN`), client, currency (EUR/JPY/USD), subtotal, total, VAT/IRPF/withholding rates, country and service type.
- **Shared account** (`Months` + `Lines`, since 2025-10): monthly income and expense lines in their own currency, each month's JPY/EUR rate, and which invoice each income line came from.

`/dashboard` turns both into one read-only page with three sections: **Business**, **Tax** and **Household**.

**Decisions made by Yann:**
- One page, all charts, built in three phases.
- A **€ / ¥ toggle**. Amounts in other currencies are converted at **each month's ECB rate**, not today's.
- A **period selector**: "Last 12 months" (default) or one calendar year.
- Charts use the **shadcn Chart component (Recharts)**. The existing `--chart-1…5` tokens fail the colour checks on the dark background (too dark, low chroma, contrast < 3:1), so they are replaced by brighter steps of similar hues, validated with the dataviz palette script against `#14161d`: `#1f9e94` teal, `#c08a1e` amber, `#4a8fe0` blue, `#e0608d` pink, `#8a80e8` violet. Three more tokens are added: `--chart-other: #7c7b78` (the "Other" series), `--chart-muted: rgb(240 237 232 / 0.35)` (reference lines) and `--chart-gap: #12141c` (the 2px gap between stacked segments). The tokens are not used anywhere else in the app.
- No "rate per teaching hour" chart. Invoices bill lump sums (quantity `1.00`), so there are no hours to divide by.
- Expenses are grouped by **keyword rules in code**. The sheet does not get a category column.

## Shared rules

- **Invoice month** = `invoiceMonth(row)` from `src/lib/shared/model.ts`, i.e. the number prefix, with the existing fallback. This sidesteps the legacy `issueDate` bug.
- **Revenue** = `subtotal`, before VAT and withholding. **Unpaid amounts** use `total`, which is what reaches the bank.
- **Client** = grouped by `clientKey(clientName)`, displayed with the most recent spelling.
- An invoice whose `subtotal` (for revenue and tax) or `total` (for unpaid) is null is left out. Each section shows a small note such as "2 invoices skipped (no total)".

## URL and layout

`/dashboard?p=12m|YYYY&ccy=EUR|JPY`. Defaults: `p=12m`, `ccy=EUR`. Invalid values fall back to the defaults. Both controls are links, so the page stays a server component. The nav gets **Dashboard** as its first link after the logo.

```
Dashboard
[ Last 12 months ▾ ]                              [ € | ¥ ]
[ Revenue ] [ Unpaid ] [ Next filing ] [ Transfer this month ]
BUSINESS   revenue by month · client share · unpaid + delay · country/service split
TAX        quarterly table · instalments in progress
HOUSEHOLD  transfer per month · expense breakdown · income by currency + rate
```

The page uses the same heading style as the Invoices page and `max-w-5xl`. Everything stacks into one column at phone width.

The year options run from the year of the oldest invoice to the current year.

## Data flow

1. `src/app/dashboard/page.tsx` (server) loads three things in parallel:
   - `syncIndex`
   - `findSharedId` + `readShared` (this part is skipped when the sheet isn't imported)
   - `monthlyRates(from, to)`
2. Pure functions in `src/lib/dashboard/` compute each chart's data as plain, serialisable objects.
3. Client chart components in `src/app/dashboard/charts/` receive those objects and only draw. They do no maths.

### Monthly rates (`src/lib/fx/history.ts`)

- One request: `https://api.frankfurter.dev/v1/{from}..{to}?from=EUR&to=JPY,USD`, from the first day of the oldest needed month to today. 5 s timeout, `next: { revalidate: 86400 }`.
- `parseMonthlyRates(json)` (pure) averages the daily rates per `YYYY-MM` → `Record<month, { JPY, USD }>`.
- `rateFor(rates, month)` uses that month's rate, or else the closest earlier month that has one.
- **Fallback when the request fails:**
  - For JPY, use the shared `Months.fxJpyPerEur` of that month, or of the closest earlier saved month. Before the first saved month, use 177, the same default as `/shared`.
  - For USD, use 1.1.
  - Either way, show a banner: "Exchange rates unavailable — converted amounts are approximate."

### Conversion (`src/lib/dashboard/convert.ts`)

`convert(amount, from, to, month, rates)` converts through EUR. Results are rounded to the target currency's minor unit with `roundMoney`.

## Key figures row

| Tile | Value |
|---|---|
| Revenue | Σ revenue in the period, in the selected currency, plus "±N% vs previous period" (the 12 months before, or the previous year) |
| Unpaid | Number of unpaid invoices and their total in the selected currency, converted at today's month rate |
| Next filing | The quarter whose deadline comes next (not the period's), with its VAT charged, IRPF withheld (in €) and deadline. On 2026-10-12 that is "Q3 · due 20 Oct". From 21 Oct it switches to Q4, marked "so far". |
| Transfer this month | `transferJpy`/`transferEur` of the current month if it is saved. Otherwise "not saved yet", linking to `/shared` |

## Business (`src/lib/dashboard/business.ts`)

1. **Revenue by month.** Stacked bars, one per month of the period.
   - The 4 clients with the most revenue in the period get `--chart-1…4`. Everyone else is grouped as "Other" (`--chart-5`).
   - The tooltip shows each client's amount and the month's total.
   - A faint line shows the same month's total one year earlier.
2. **Client share.** Ranked horizontal bars showing each client's % and amount for the period, with the caption "Top client: N%".
3. **Unpaid invoices.**
   - A table of number (linked to `/invoices/[id]`), client, invoice month, `total` in the invoice's currency, and age in months. Oldest first.
   - Which invoices count:
     - invoice month ≥ the **first shared month that links an invoice** (or the current month before any link). Months imported from the legacy tabs carry no links, so earlier invoices cannot be told apart from paid ones;
     - currency JPY or EUR (USD can't be linked in `/shared`);
     - `fileId` is not the `invoiceId` of any income line.
   - The period selector does not filter it.
4. **Payment delay.** For each client, the median number of months between the invoice month and the shared month of the income line linking it, e.g. "Matinno: same month · LWB: +1 month". Clients with no linked invoices are hidden.
5. **Country / service split.** Two small sets of ranked bars of period revenue: by `effectiveCountry` and by `effectiveServiceType`.

## Tax (`src/lib/dashboard/tax.ts`)

This section always covers **one calendar year**: the selected year, or the current year when `p=12m`. It is **always in €**, whatever the toggle says.

1. **Quarterly table**, Q1–Q4 plus a year total. Per quarter, summed over that quarter's invoices, with amounts in other currencies converted at their month's rate:

   | Column | Value |
   |---|---|
   | Revenue base | Σ `subtotal` |
   | VAT charged | Σ `subtotal × vatRate` (Modelo 303) |
   | IRPF withheld | Σ `subtotal × irpfRate` (subtracted in Modelo 130) |
   | Foreign withholding | Σ `subtotal × withholdingRate` (double-taxation credit) |
   | Due | Q1 20 Apr · Q2 20 Jul · Q3 20 Oct · Q4 30 Jan (following year) |

   - A quarter that hasn't ended is marked "so far".
   - The page does **not** estimate the Modelo 130 payment, because deductible business expenses aren't in the app.
2. **Instalments in progress.** Expense lines with `inst` from the **latest saved** shared month. Each shows its label, a progress bar `index / count`, the amount per payment, and what's left (`total − index × amount`). Finished instalments drop off, as they do in `carryForward`.

## Household (`src/lib/dashboard/household.ts`)

This section shows the full shared history and ignores the period selector. Each month uses its own `fxJpyPerEur`, and the € / ¥ toggle applies.

1. **Transfer per month.** One bar per saved month (`totals()` from the shared model), with negative months in the warning colour and a thin line for the average.
2. **Expense breakdown.** Stacked bars per month, grouped by `expenseCategory(line)`. The first matching rule wins, case-insensitive:

   | Category | Rule |
   |---|---|
   | Taxes & social security | `line.inst` set, or the label matches `tax\|irpf\|iva\|hacienda\|aut[oó]nomo\|cotisation\|cuota\|seguridad social` |
   | Savings | `saving` |
   | Housing | `rent\|rental\|airbnb\|alquiler` |
   | Subscriptions & gym | `subscription\|gym\|netflix\|spotify` |
   | Other | everything else ("Spendings", "Miscalc Matinno", …) |

   The tooltip lists the labels behind each segment, so a line in the wrong group is easy to spot.
3. **Income by currency + rate.** Stacked bars of income that arrived in JPY vs EUR, converted to the selected currency. Below them is a small line chart of `fxJpyPerEur` on the same month axis. There is no second y-axis.

## Error and empty states

- **Shared sheet not imported:** Household, Unpaid and Payment delay show the "Import it in Settings" card from `/shared`. Business and Tax still render.
- **Index sync failures:** `SyncWarning`, as on the other pages.
- **Rates unavailable:** the banner and fallbacks described above.
- **A chart with no data for the period:** the chart shows "Nothing in this period".

## Files

| File | Responsibility |
|---|---|
| `src/lib/fx/history.ts` | Frankfurter time-series fetch, `parseMonthlyRates`, `rateFor` |
| `src/lib/dashboard/period.ts` | Parse `p`/`ccy`, list the period's months, the previous period, year options |
| `src/lib/dashboard/convert.ts` | Currency conversion at a month's rate |
| `src/lib/dashboard/business.ts` | Revenue by month, client share, unpaid, payment delay, splits |
| `src/lib/dashboard/tax.ts` | Quarter rows, due dates, next filing, instalments |
| `src/lib/dashboard/household.ts` | Transfers, `expenseCategory`, expense breakdown, income by currency |
| `src/lib/dashboard/format.ts` | Money, compact axis labels, month and date labels, percentages |
| `src/app/dashboard/page.tsx` | Server page: loads data, assembles `DashboardData`, lays out sections |
| `src/app/dashboard/ui.tsx` | Server building blocks: `Section`, `Panel`, `Stat`, `Pill`, `ShareBars`, `Empty`, `NotImported` |
| `src/app/dashboard/charts/*.tsx` | Client chart components (shadcn `ChartContainer`) |
| `src/components/ui/chart.tsx` | Added via `npx shadcn add chart` (brings `recharts`) |
| `src/app/layout.tsx` | Nav link |

## Phases

1. Rates, period/convert, key figures, Business, and the page with its nav link.
2. Household.
3. Tax.

Each phase is a working page with its own tests and commit(s).

## Testing

- **Vitest** for every pure module, with small `IndexRow`/`Line` factories:
  - `parseMonthlyRates`: monthly averages; `rateFor` falling back to an earlier month.
  - `period`: `12m` across a year boundary, a calendar year, invalid input → defaults, previous period.
  - `convert`: EUR↔JPY↔USD at a month's rate, and rounding.
  - `business`:
    - top-4 + "Other";
    - client grouping by `clientKey`;
    - unpaid excludes linked invoices, invoices before the first linked month and USD invoices;
    - payment delay as a median;
    - null subtotals are skipped and counted.
  - `tax`: quarter assignment, the VAT/IRPF/withholding sums, a mixed-currency quarter, due dates including Q4 → January, and "so far".
  - `household`:
    - `expenseCategory` on every real label: Rental, Gym, Savings, Spendings, Subscription Claude, Autonomo cotisation, Tax Yann Q1, Tax 2nd semester, Half Rental Airbnb, Additional Spendings, Miscalc Matinno;
    - transfer per month matches `totals()`;
    - the instalment remainder.
- **Manual, in `npm run dev`:**
  - The app is dark-only (`<html className="dark">`). Check the page at desktop and phone width, and switch between `12m` and 2025.
  - Toggle € / ¥.
  - Cross-check one month's revenue and Q3 2026's VAT/IRPF against the invoice sheets by hand.
  - Block `api.frankfurter.dev` and confirm the fallback banner appears.

## Out of scope

- Editing anything from the dashboard.
- Estimating the Modelo 130 payment.
- A category column in `Lines`.
- Rate per teaching hour.
- Fixing the legacy `issueDate` parsing.
- Exporting charts.
