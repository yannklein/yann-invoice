# Invest planner (`/invest`): design

## Why

Yann invests a few times a year in an IBKR account (EUR) and follows Andrew Hallam's *Millionaire Expat* (3rd ed.) lazy-ETF approach, and wants to move toward SRI funds. The planning lives in the hand-made Google Sheet **"Stock mix"** (`1RTPAEPGPsWahqi_GzmnLPNQ3GmEBcP6kQR9Wy1Vu8CM`). Its `IBKR` tab gets a new block of hand-computed columns every round ("Planned mix / Actual mix / Planned adjustment / To buy (2026/7/5) / Actual buy / New mix").

**The moment this page serves:** it's a fixed buy date, say January, and Yann opens `/invest`. The page says *"buy €X of IWRD, €Y of IMEU, €0 of bonds"*. The per-buy amount comes from a long-term view (10/20/30/40 years). The goal is good, profitable decisions **with minimal time spent**.

**Secondary:** a history of the holdings, and "you vs the legends". Other lazy strategies get the *same euros on the same dates*. Jokes are sprinkled generously.

## Actual state (2026 YTD Activity Statement up to 2026-10-15; anonymised copy in `tests/fixtures/ibkr-activity.csv`)

- **IBKR Ireland, base currency EUR.** Positions:
  - **IWRD** 256.1369 (iShares MSCI World, IE00B0M62Q58, AEB; pays dividends in USD)
  - **IMEU** 158.3901 (iShares Core MSCI Europe, IE00B1YZSC51, AEB)
  - **CSBGE3** 66 (iShares € Govt Bond 1–3yr Acc, IE00B3VTMJ91, EBS)
- **Cash:** €55.99 + $39.52. NAV €38,094.43. IBKR's time-weighted return for 2026 YTD is 10.30%.
- **Transfer in:** IMEU 158.3901 and IWRD 198.6907 came over on **2026-01-27** from the old IBKR Japan account (U18192452), worth €22,133.14.
- **2026 deposits:** €12,700 in total.
- **Buys:**
  - CSBGE3 on 2026-02-04, €7,671.18 + €3.84 commission
  - IWRD on 2026-07-06, a **fractional** 57.4462 units, €5,198.99 + €3 commission
- **Livret Bleu:** €4,559.70, counted as bonds since the 2026/7/5 round.
- **SRI:** none held yet; Yann wants to move toward it.
### How the money got here (confirmed with Yann; the exact dates are inferred)

1. **Rakuten Securities era, Dec 2022 – 2025 (sheet tab `Japan`).** Japanese-listed funds, with new money deposited on 2022/12 ¥1.2M, 2023/07 ¥1.2M, 2024/01 ¥1.2M and 2025/01 ¥1.0M (¥4.6M in total).
   - Values after each buy: 2023/07 ¥2,497,010, 2024/01 ¥3,256,348 and 2025/01 ¥5,102,632.
   - There was also the UBS Europe ETF position, worth about ¥375,000 (the sheet's "With UBS" view).
2. **IBKR Japan (U18192452), 2025.**
   - **New money:** ¥750,000 for non-Japanese ETFs, inferred as **2025-07-01**. It grew to ¥815,666 by 2025-09-29, about +8.8%, which matches the move in IWRD and EUR/JPY since early July.
   - **Moved money:** the Rakuten holdings were then **sold**, and part of the proceeds arrived as ¥2,703,676 of cash.
3. **IBKR Ireland, 2026.**
   - The positions were transferred on 2026-01-27.
   - The rest of the Rakuten money arrived as the 2026 EUR deposits (€12,700) and as the Livret Bleu (€4,559.70).

**So the only new money is the four Rakuten deposits plus the ¥750k: about €34,312 at the ECB rates of their dates.** Every other movement is the same money moving around. Treating it as new would make a ~+24% gain look like a ~−18% loss.

## Goals

- **This round:** the amount for the round, split per slot by buy-only rebalancing, with fractional units at today's price, the next buy date, and a countdown.
- **Long game:** a per-buy slider → projected value at 10/20/30/40y in **today's euros**. Save writes it to the sheet.
- **You vs the legends:** a chart and scoreboard against Hallam EU, Hallam SRI, Hallam all-in-one, Buffett 90/10, All-Weather, Permanent, and a joke line, All-in Berkshire. Same **new-money** EUR flows since 2022-12-01.
- **History:** value over time, plus a trades table.
- **SRI path:** shift new money into SRI equivalents, never by selling.
- **The Google Sheet is the source of truth / DB**, using new tabs in "Stock mix". IBKR exports are uploaded (CSV) and prices are fetched automatically.

## Non-goals and anti-goals

- **Out of scope:** sell advice, market timing, daily tracking, alerts, tax reports. The Rakuten pot no longer exists; it only lives on as history.
- **Never write** the existing `Japan` / `IBKR` tabs, and never clear any tab the app didn't create.
- **Anti-goal: nudging frequent checking or trading.** Drift shows as a calm note, never "buy now".
- **Anti-goal: silent wrong numbers.**
  - Stale or missing prices are labelled.
  - Unparsed CSV rows are reported.
  - Uploads with non-EUR rows are refused when FX rates are unavailable.
  - Mismatches between the sheet and the export are shown.

## Decisions

### Decided with Yann

- Everything is now in IBKR Ireland (EUR) plus the Livret Bleu. History and the comparison start with the first Rakuten deposit on **2022-12-01**.
- Only new savings count as contributions. Moves between Rakuten, IBKR Japan, IBKR Ireland and the Livret Bleu are internal.
- Fixed buy dates. The amount is explored with a slider, not solved from a target.
- The target mix is fixed (55/20/25) and editable in the sheet. No age glide path.
- Projections are in real (today's) euros.
- Comparisons: Hallam's book portfolios, Buffett 90/10, All-Weather, Permanent.
- Humour: generously sprinkled.
- Storage: the "Stock mix" file with new tabs.
- Data: the YTD export; the earlier history is inferred from the sheet; Hallam weights come from the web.

### Claude's calls

- **Page and linking:** `/invest` with an "Invest" nav link; the sheet is linked from Settings.
- **Buying rules:** buy-only rebalancing, fractional units (4 dp), buy months January + July.
- **What counts as money in:**
  - Contributions = `Deposits` rows with `kind = new`, never trades.
  - Imported IBKR deposits dated before `internalBefore` (default 2026-07-06) are `internal`; later ones are `new`. Yann can flip any row in the sheet.
  - Transfers are holdings, not money.
- **Deposit dates:** the Rakuten deposits are dated the 1st of their month.
- **UBS:** the UBS ETF (~¥375k) counts in the 2024/2025 snapshots, following the sheet's "With UBS" total.
- **"You" history line:** approximate (dashed) until `exactFrom` = 2026-07-05, the day all the moved money had landed in IBKR Ireland and the Livret Bleu.
  - Dividends and cash count toward your value.
  - Benchmarks use adjusted closes.
- **Projection assumptions:** 5% real return for stocks, 1% for bonds; the slider runs €0–30k in €250 steps.
- **Prices:** Yahoo's v8 chart endpoint (free, no key, unofficial), cached for a day, with stale labelling.
- **Livret Bleu:** its first balance (2026-07-05) is internal Rakuten money, so its deposit is 0. Its later growth without a deposit is interest, which counts as return.
- **Bonds slot stays CSBGE3:** no SRI € govt 1–3y ETF with Yahoo data was found.

## Design

### Sheet tabs (created in "Stock mix" when linked; row 1 = header)

| Tab | Columns | Notes |
|---|---|---|
| `Trades` | key, date, account, symbol, isin, currency, quantity, price, commission, amountEur, source, note | `source` ∈ ibkr/transfer/manual. `amountEur` = signed cash cost in EUR: buys positive, sells negative, commission included. For transfers it is the market value. Frozen at import. |
| `Deposits` | key, date, currency, amount, amountEur, source, kind, note | `source` ∈ ibkr/sheet; `kind` ∈ new/internal. Rows with `kind = new` are the contributions to the comparison. |
| `Dividends` | key, date, symbol, currency, amount, amountEur | |
| `Cash` | date, deposit, balance, note | Livret Bleu, in EUR. |
| `Snapshots` | date, valueEur, note | Values before the export period. |
| `Plan` | key, value | buyMonths `1,7`, perBuyEur `5000`, realReturnStocks `0.05`, realReturnBonds `0.01`, birthYear (blank), internalBefore `2026-07-06`, exactFrom `2026-07-05`. |
| `Slots` | slot, kind, targetPct, holdSymbols, buySymbol, sriSymbol, livret | World/stocks/55/IWRD/IWRD/2B7K/n · Europe/stocks/20/IMEU/IMEU/IUSK/n · Bonds/bonds/25/CSBGE3/CSBGE3/–/y |
| `Symbols` | symbol, isin, yahoo, name, terPct, sri | IWRD IE00B0M62Q58 IWRD.AS 0.50 n · IMEU IE00B1YZSC51 IMEU.AS 0.12 n · CSBGE3 IE00B3VTMJ91 CSBGE3.SW 0.07 n · 2B7K IE00BYX2JD69 2B7K.DE 0.20 y · IUSK IE00B52VJ196 IUSK.DE 0.20 y |
| `Benchmarks` | benchmark, yahoo, weight, note | See below. |

**Seed rows** are written when a tab is created:
- `Deposits`: source `sheet`, kind `new`, with the ECB rate (JPY per EUR) of the date or the closest earlier business day:

  | date | JPY | rate | EUR | note |
  |---|---|---|---|---|
  | 2022-12-01 | 1,200,000 | 142.48 | 8,422.23 | Rakuten (Japan tab) |
  | 2023-07-01 | 1,200,000 | 157.16 | 7,635.53 | Rakuten |
  | 2024-01-01 | 1,200,000 | 156.33 | 7,676.07 | Rakuten |
  | 2025-01-01 | 1,000,000 | 163.06 | 6,132.71 | Rakuten |
  | 2025-07-01 | 750,000 | 168.70 | 4,445.76 | IBKR Japan, date inferred |

- `Snapshots` (whole-portfolio values, notes give the ¥ source):
  - 2022-12-01 €8,422.23
  - 2023-07-01 €15,888.33 (¥2,497,010)
  - 2024-01-01 €23,228.73 (¥3,631,348, including UBS)
  - 2025-01-01 €33,592.74 (¥5,477,632, including UBS)
- `Cash`: 2026-07-05, deposit 0, balance 4,559.70, note "Rakuten money (internal)".

### Benchmarks (Yahoo symbols verified on 2026-10-17; weights per the book summary, editable)

- Hallam EU: VWCE.DE 40 · IMEU.AS 25 · IBGS.AS 35
- Hallam SRI: 2B7K.DE 40 · IUSK.DE 25 · IBGS.AS 35
- Hallam all-in-one: V60A.DE 100
- Buffett 90/10: SXR8.DE 90 · IBGS.AS 10
- All-Weather: VWCE.DE 30 · IBGL.AS 40 · IBGM.AS 15 · 4GLD.DE 7.5 · EXXY.DE 7.5
- Permanent: VWCE.DE 25 · IBGL.AS 25 · 4GLD.DE 25 · XEON.DE 25
- All-in Berkshire: BRK-B 100 (USD → EUR)

Hallam weights source: a reader's summary of the book ([Goodreads](https://www.goodreads.com/book/show/22829719-the-global-expatriate-s-guide-to-investing)). The page labels them "per book summary — edit in sheet".

### Numbers

- **Holdings:** the net quantity per symbol over `Trades`. A symbol in no slot's `holdSymbols` shows as "unassigned".
- **IBKR cash (EUR):** Σ ibkr deposits − Σ amountEur of ibkr trades + Σ dividends. Transfers and `sheet` deposits are excluded.
- **Value:** own holdings × the latest Yahoo close (converted to EUR), plus IBKR cash, plus the latest Livret Bleu balance.
- **Stale price:** a price is stale if Yahoo fails or the last point is more than 5 days old. When Yahoo fails, the fallback is the last trade price.
- **This round's amount:** perBuyEur + IBKR cash, overridable with `?amount=`.
- **Buy-only rebalance:**

  ```
  targetAfter_i = (total + amount) × w_i
  gap_i         = max(0, targetAfter_i − value_i)
  ```

  If Σgap ≤ amount, buy the gaps and spread the remainder by w. Otherwise scale the gaps to fit the amount. Each slot buys its `buySymbol`. The Bonds buy is labelled "bond ETF or Livret Bleu".
- **Next buy date:** the 1st of the next month in `buyMonths`. Today counts if it is that day.
- **Drift note:** shown if any slot is more than 10 points off target.
- **Projection (real €):**

  ```
  r = Σ w_i · r_kind(i)
  p = (1 + r)^(1/n) − 1          (n = buys per year)
  V_k = V_{k−1} · (1 + p) + perBuy
  ```

  Shown at 10/20/30/40 years. The Buffett-age horizon is 96 − Yann's age, shown when `birthYear` is set.
- **Simulation:**
  - Flows = `Deposits` with `kind = new`, plus non-zero `Cash.deposit` (EUR).
  - Each benchmark invests every flow on its date and rebalances to its weights only on flow dates. It is valued on the adjusted close in EUR. A leg with no price yet holds cash at 0%.
  - **"You" before `exactFrom`:** a linear interpolation through the Snapshots plus the exact value on `exactFrom`, marked approximate.
  - **"You" from `exactFrom` on:** units × close + IBKR cash + Livret Bleu.
  - **Invested** = Σ flows (≈ €34,312 today).
  - Points are weekly from the first flow, plus today.
- **Badges:**
  - Sloth Master: ≥180 days since the last trade.
  - Bullseye: every slot within 2 points of target.
  - Diamond Hands: a buy while You was ≥10% below its running peak.
  - Compound Club: the 40-year projection is ≥ €1M.
- **Quips:** 2–4 rotate per day (deterministic); one per scoreboard row.

### Page (`/invest`), top to bottom

1. **Header:** NEXT BUY {Month YYYY} (in N days) · Lazy streak 🦥 N days · badges
2. **This round:**
   - Amount (form GET `?amount=`).
   - Per slot: now% → target%, buy €, ≈units of buySymbol.
   - Drift note.
   - Upload IBKR export: preview of new/duplicate counts, reconciliation, unparsed rows, then Confirm.
3. **SRI path:** per slot, its SRI candidate and TER versus the current one, with a "Use for new buys" button. Shows the SRI share of the portfolio.
4. **Long game:** slider, 10/20/30/40y, Buffett-age quip, Save.
5. **You vs the legends:** line chart, scoreboard (value, € vs You, quip), quips.
6. **History:** value chart (dashed before `exactFrom`), trades table, Livret Bleu balance form, "Open sheet ↗".

If no sheet is linked, the page shows a card linking to Settings.
