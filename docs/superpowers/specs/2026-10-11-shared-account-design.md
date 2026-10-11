# Shared account transfer — monthly calculator

## Context

On the 1st of each month Yann works out how much of his private money goes to the couple's shared account. Today that is a new tab in the Google Sheet **Shared account money** (`13AMIrh2BkBSoRQPQaBGWeACFsptYDW4_k9PoT8FtTt8`), one per month from "Oct 1st" (2025-10) to "Sep 1st" (2026-09):

- **Income (column B):** money that actually landed on his bank account: Matinno (stable, JPY), Le Wagon Barcelona (EUR), Le Wagon Tokyo (JPY), occasional others.
- **Expenses (column C):** the part he keeps ("Savings", usually 150 000 JPY), subscriptions, gym, rent (no longer), taxes, autónomo cotisation, other spendings.
- **Transfer** = income − expenses (`F1`).

**How the sheet actually works (read from the formulas):**
- Values are in **kJPY**. EUR amounts are typed as formulas that convert with a per-tab rate in `I1` (JPY per EUR), e.g. `=5696.25*I1/1000`, `=(700+350)*I1/1000`, `=1000*I1/1000/2`.
- Plain numbers (`404`, `200`) are already kJPY.
- Tax is sometimes paid in instalments: `=2598/3*I1/1000` appears for three months running, with notes "1/3 … 2/3 next", "… 3/3 next", "… finish".
- Column D holds free-text comments. `F2` = `F1*1000/177` (EUR total at a hard-coded rate). Columns H–I contain unrelated scratch calculations.

**Decisions made by Yann:**
- Income is **what reached the bank**, not what was invoiced. He picks which invoices were paid, from invoices up to 3 months old.
- Lines are entered in their own currency. Totals are shown in **JPY and EUR** using one editable JPY/EUR rate per month.
- The Google Sheet stays the database, restructured as **tidy tabs**. The 12 existing tabs are imported once and left untouched as an archive.
- Instalments are entered as **total ÷ N** and carried forward automatically ("1/3", "2/3", "3/3"), then dropped.
- Expenses carry over from the previous month. **Income never carries over**, whether it came from an invoice or was typed by hand.

## Data model (new tabs in "Shared account money")

The app finds the spreadsheet by `appProperties` `yannInvoiceRole = shared` (the same mechanism as `index` and `template`; `Role` gains `'shared'`). No new env var.

**`Months`**, one row per saved month:

| month | fxJpyPerEur | note | updatedAt |
|---|---|---|---|
| `2026-10` | `177.2` | free text | ISO timestamp |

**`Lines`**, one row per line, in display order:

| month | kind | label | amount | currency | invoiceId | instTotal | instIndex | instCount | note |
|---|---|---|---|---|---|---|---|---|---|
| `2026-10` | `income` | Matinno 202609006 | 404055 | JPY | `1y8QX…` | | | | |
| `2026-10` | `expense` | Savings (kept) | 150000 | JPY | | | | | |
| `2026-10` | `expense` | Tax 2nd semester | 866 | EUR | | 2598 | 2 | 3 | |

- `kind` ∈ `income | expense`. `currency` ∈ `JPY | EUR`. `amount` is stored in the line's own currency, rounded to its minor unit (JPY 0 decimals, EUR 2).
- `invoiceId` is the Drive file ID of the invoice the income came from. It is empty for manual lines.
- An instalment line has all three of `instTotal`, `instIndex` and `instCount` set; `amount` defaults to `instTotal / instCount` but can be edited.

## Calculation (pure, `src/lib/shared/model.ts`)

- `toJpy(line, fx)`: JPY as-is; EUR × `fx`.
- `totals(lines, fx)` → `{ incomeJpy, expenseJpy, transferJpy, transferEur }`. `transferJpy` = Σ income − Σ expense, rounded to 0 decimals. `transferEur` = `transferJpy / fx`, rounded to 2 decimals. Also returns per-currency subtotals for display.
- A negative transfer is allowed (Aug 2026 was −180 kJPY). It is shown in a warning colour.
- `carryForward(prevLines, newMonth)`: drop all `income` lines. Copy `expense` lines with a new month. An instalment with `instIndex < instCount` is copied with `instIndex + 1`; one with `instIndex === instCount` is dropped. Notes are cleared.
- `invoiceMonth(indexRow)`: the `YYYYMM` prefix of the invoice number when it parses as a valid month. Otherwise the earlier of `issueDate` and Drive `modifiedTime`. The fallback exists because legacy sheets currently report `issueDate = 2026-10-04`; they probably contain `=TODAY()`. Fixing that parser issue is out of scope.
- `candidateInvoices(indexRows, allLines, month)`: invoices whose `invoiceMonth` is between `month − 3` and `month` inclusive, and whose `fileId` is not linked by an income line of **another** month. Newest first.
- `incomeFromInvoice(row)`: label `"{client} {number ?? title}"`, `amount = invoice.total`, `currency = invoice.currency`. Currencies other than JPY/EUR (e.g. a USD invoice) are not offered.

## One-time import (pure parser `src/lib/shared/importLegacy.ts` + Settings action)

Input: each legacy tab read twice through the Sheets API, once with `valueRenderOption=FORMULA` and once with `UNFORMATTED_VALUE`, range `A1:I40`.

- **Month:** the tab name is a month name ("Oct 1st", "June 1st", "July 1st" …). Tabs are taken in sheet order. The last tab maps to the most recent such month on or before the current month (Sep 1st → 2026-09 when run in Oct 2026). Earlier tabs count backwards, so year boundaries resolve themselves.
- **FX:** `I1` when it is numeric. Otherwise the inline rate found in the formulas (Nov uses `*177/1000`). Otherwise 177.
- **Rows** 2…n: `label` = column A. A value in column B gives an income line; a value in column C gives an expense line. Rows are skipped when the label starts with "TOTAL", when both B and C are empty, or when the value is 0.
- **Value → line:**
  - Formula references `I1` or an inline `*<rate>/1000` → EUR, `amount = value × 1000 / rate`, rounded to 2 decimals.
    - If the formula matches `<total> / <n> * …`, it is an instalment with `instTotal = total` and `instCount = n`. `instIndex` is the line's position in its run of consecutive months with the same label and `instTotal`.
    - If the EUR part is an expression rather than a single number (e.g. `(700+350)`), that expression is kept in `note`.
  - Plain number → JPY, `amount = value × 1000`.
- Column D text → `note` of that row's line. Columns E–I are ignored.
- **Self-check:** for every tab, Σ income − Σ expense converted back to kJPY must equal the cached `F1` within 0.01. The preview lists any tab that fails.

**Settings UI:** a "Shared account" card.
1. Paste the sheet URL or ID, then click **Preview**. This shows months found, line counts and the self-check per tab.
2. Click **Import**. This tags the file with role `shared`, creates `Months` and `Lines` (headers + data), and leaves the old tabs as they are.

Re-importing replaces both tabs, and the preview says so.

## Page `/shared` (nav link "Shared account")

- `?m=YYYY-MM`, defaulting to the current calendar month. Prev/next arrows sit next to a list of saved months.
- **Saved month:** loads its `Months` and `Lines` rows.
- **New month** (shown with a "Draft — not saved" badge): the lines are `carryForward` of the latest saved month before it. The FX rate is today's EUR→JPY from `https://api.frankfurter.app/latest?from=EUR&to=JPY` (server fetch, 3 s timeout, revalidated hourly), falling back to the previous month's rate.
- **Received from invoices:** a checklist of `candidateInvoices` showing number, client, date and total. Ticking one adds an income line; unticking removes the line linked to it.
- **Income** and **Expenses** tables: editable label, amount and currency; add and delete rows. Expense rows can be turned into instalments (total, N, current index). Instalment rows show `2/3 · 2 598 € total`.
- **FX rate** input (JPY per EUR) and a month note.
- **Result panel**, updating live: income, expenses and transfer in ¥ and €.
- **Save** is a server action. It validates with zod (the rules are shared with the client form) and writes the month.
- **Not imported yet:** if no spreadsheet carries role `shared`, the page links to Settings.

## Storage (`src/lib/shared/store.ts`)

- `findSharedId(drive)` via `findByRole(drive, 'shared')`.
- `readAll(sheets, id)` → `{ months, lines }` from `Months!A2:D` and `Lines!A2:J`. With about 20 lines × 12 months, reading everything on each request is fine: two value reads.
- `saveMonth(sheets, id, month, lines)`:
  - Rebuild the full `Lines` table: other months' rows unchanged, this month's rows replaced, all sorted by month.
  - Write it with **one** `values.update` from `A2`, padded with blank rows up to the previous row count. There is no clear-then-write, so a failed request never empties the tab.
  - Upsert the `Months` row the same way.
- Row ↔ object conversion lives in pure helpers (`rows.ts`), mirroring `src/lib/index/rows.ts`, and invalid rows are skipped.

## Files

| File | Responsibility |
|---|---|
| `src/lib/shared/types.ts` | `Line`, `MonthRecord`, `Kind`, `LineCurrency` |
| `src/lib/shared/model.ts` | Pure: totals, carryForward, invoiceMonth, candidateInvoices, incomeFromInvoice, month arithmetic |
| `src/lib/shared/rows.ts` | Pure: sheet rows ↔ objects, table rebuild for `saveMonth` |
| `src/lib/shared/importLegacy.ts` | Pure: legacy tab (formulas + values + name) → month + lines + self-check |
| `src/lib/shared/store.ts` | Sheets I/O, role lookup, import write |
| `src/lib/shared/fx.ts` | Frankfurter fetch with fallback |
| `src/app/shared/page.tsx` | Server page: loads data, builds draft or saved month, candidates |
| `src/app/shared/SharedMonthForm.tsx` | Client form (react-hook-form), live totals |
| `src/app/shared/actions.ts` | `saveMonthAction` |
| `src/app/settings/*` | Shared-account import card + actions |
| `src/lib/google/drive.ts` | `Role` gains `'shared'` |
| `src/app/layout.tsx` | Nav link |

## Testing

- **Vitest** for the pure modules:
  - `totals`, including EUR conversion, rounding and negative transfers.
  - `carryForward`: instalment 2/3 → 3/3 → dropped; income dropped; notes cleared.
  - `invoiceMonth`: from a number, from the `issueDate`/`modifiedTime` fallback, and a `202608001b` suffix.
  - `candidateInvoices`: window edges, links from other months excluded, links in this month still shown.
  - Row round-trips.
- **`importLegacy`** with fixtures taken from the real tabs (Apr, May, July, Aug, Sep 2026 and Nov 2025). Each must pass the self-check against its `F1`.
  - Sep 2026 → LWB 5696.25 EUR, Rental 1195.61 EUR, Savings 200 000 JPY, Tax 2nd semester 2598/3 at index 3/3; transfer 808.43 kJPY.
  - Apr 2026 half-rent `1000*I1/1000/2` → 500 EUR.
- **Manual, in `npm run dev`:**
  1. Import preview shows 12 months, all passing the self-check. Then import, and confirm the old tabs are untouched.
  2. Open `/shared?m=2026-10`. The draft carries Sep's expenses, the tax instalment is gone (it finished 3/3), income is empty, and the FX rate is filled in.
  3. Tick the Matinno 202609006 invoice. Add a manual line. Check the totals by hand. Save, and confirm the rows appear in the sheet.
  4. Reload. The month is now saved and Matinno 202609006 no longer appears as a candidate in `/shared?m=2026-11`.

## Out of scope

Making the transfer itself, bank integration, charts, fixing the legacy `issueDate` parsing, and currencies other than JPY/EUR.
