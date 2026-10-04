# yann-invoice — Invoice generator backed by Google Sheets

## Context

Yann (autónomo in Barcelona) writes invoices by hand. Each one is a copy of an earlier Google Sheet (~55 files named `Invoice …`, 2020 → 2026) that he edits manually. That means re-typing client details, picking the bank account, working out the next number, and remembering which tax notes apply. The goal is a small private website that:
- creates invoices automatically: client and bank picked from history, number generated, legal notes set by the client's country;
- stores everything as Google Sheets in one dedicated Drive folder (the sheets are the source of truth);
- lists invoices, shows their details, links to each Sheet, and downloads them as PDF.

**Decisions made by Yann:** Next.js hosted on the Coolify homelab · numbers stay `YYYYMMXXX` · Japanese withholding is a per-client setting · the Spain rule also depends on the service type (teaching or other).

**Facts from reading the existing invoices** (examples: 202609005, 202609003, 202601001, 202606003/004, 202608003, the 2021 Steampunk sheets):
- They all use the same 6-column template (A–F) on a tab named `Invoice - Yann Klein`. From top to bottom: INVOICE / `No. X` (or `Invoice no: X`), the sender block in E–F, `Invoice For:` with client lines in column B, `Issue Date`, `Terms`, a DESCRIPTION/QUANTITY/UNIT PRICE/AMOUNT table (up to 8 rows), SUBTOTAL, optional `IRPF (7%)`, `VAT RATE` / `IVA/VAT RATE` / `TAX RATE`, optional `WITHHOLDING TAX RATE`, `AMOUNT DUE` / `TOTAL after withholding tax`, `Notes` lines, then `- Bank account details:` lines.
- Currencies: € and ¥.
- Bank accounts: Caixabank ES93…, Crédit Mutuel FR76…, SMBC Prestia JP (multi-line Japanese format), Shinsei JP (legacy).
- Numbers: `YYYYMM` + 3-digit counter shared across clients. Some have suffixes (`202608001b`), some older ones have no number, and in one sheet the number doesn't match the file title.
- Legacy notes reflect when Yann lived in Japan. The new rules only apply to invoices sent from Spain.

## Architecture

```
Browser ── Next.js (App Router, TS) on Coolify ── googleapis (user OAuth token)
                                                   ├─ Drive API  (folder, copy, move, list, PDF export)
                                                   └─ Sheets API (read/write invoice cells, index sheet)
```

- **Auth:** Auth.js v5 with the Google provider. Scopes: `openid email profile drive spreadsheets`, `access_type=offline`, `prompt=consent`. The refresh token is kept in the encrypted JWT session and refreshed in the `jwt` callback. Only `ALLOWED_EMAIL=yann.luc.klein@gmail.com` can sign in.
  - Full `drive` scope is needed so the app can move the legacy files.
  - Keep the OAuth app "In production" but unverified. It's fine for one user, and avoids the 7-day refresh-token expiry that "Testing" mode imposes.
- **Drive layout:** one folder, `Invoices` (ID stored in env `INVOICES_FOLDER_ID` after setup), containing:
  - every invoice spreadsheet (legacy and new);
  - `Invoice Template`: a copy of 202609003 with its values cleared, plus a withholding row and **named ranges** (`INV_NUMBER`, `ISSUE_DATE`, `TERMS`, `SENDER`, `CLIENT`, `ITEMS`, `SUBTOTAL_ROW`, `IRPF_ROW`, `VAT_ROWS`, `WHT_ROWS`, `TOTAL`, `NOTES`, `BANK`);
  - `Invoice Index`: a derived cache that can always be rebuilt from the invoices. It exists because Sheets limits reads to about 60 per minute per user, so parsing ~55 files on every page load isn't possible. Tabs:
    - `Invoices`: fileId, number, client, issueDate, currency, subtotal, total, country, modifiedTime
    - `Clients`: name, lines, country, currency, terms, serviceType, withholdingRate, bankLabel, lastUsed
    - `Banks`: label, lines
    - `Settings`: sender lines, IRPF rate, default terms
- **Sync:** each time the list loads, one Drive `files.list` call on the folder is compared with `modifiedTime` in the index. Only new or changed sheets are re-parsed. This means edits made directly in Google Sheets show up in the app. A "Full resync" button rebuilds the whole index (throttled to stay under quota).

## Modules (each small and testable)

| File | Responsibility |
|---|---|
| `src/lib/google/client.ts` | Builds Drive/Sheets clients from the session token |
| `src/lib/invoice/parse.ts` | **Pure:** cell grid (A1:F60) + file title → `ParsedInvoice`. Finds fields by their labels, not fixed cells. Number from `No.`/`Invoice no:`, falling back to the title. Currency from the symbol. Country from the last client address line (country-name list), otherwise `unknown`. |
| `src/lib/invoice/numbering.ts` | **Pure:** `nextNumber(existingNumbers, issueDate)` → `YYYYMM` + (highest 3-digit counter in that month + 1), zero-padded. Ignores suffixes when looking for the highest. `isDuplicate()` for warnings. |
| `src/lib/invoice/taxRules.ts` | **Pure:** `(country, serviceType, settings, client)` → `{vatRate, irpfRate, withholdingRate, notes[]}` |
| `src/lib/invoice/totals.ts` | **Pure:** subtotal = Σ qty×price; VAT, IRPF and withholding calculated on the subtotal; total = subtotal + VAT − IRPF − withholding. Rounded to the currency's minor unit (JPY 0, EUR 2). Matches the history: 100 − 7 = 93; ¥450,000 − 45,945 = ¥404,055. |
| `src/lib/invoice/write.ts` | Copies the template into the folder, writes the named ranges with a Sheets `batchUpdate`, deletes rows that aren't needed (IRPF/VAT/WHT), and sets the currency number format. AMOUNT/SUBTOTAL/TOTAL stay **formulas**, so manual edits in Sheets recalculate. File name: `Invoice {Client} - {Mon YYYY} - {number}`. |
| `src/lib/index/store.ts` | Reads and writes the Index tabs, does the incremental sync, and works out client/bank defaults (the latest invoice for each client wins) |
| `src/lib/setup.ts` | One-time step: create the `Invoices` folder, move every `Invoice*` sheet that Yann owns into it (a dry-run list first), create the Template and the Index, run the full parse |
| `src/app/api/invoices/[id]/pdf/route.ts` | Streams `docs.google.com/spreadsheets/d/{id}/export?format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false` (with a Bearer token) as `Invoice {number} - {client}.pdf` |

**Tax rules** (sender in Spain; notes are pre-filled and can be edited on each invoice):
- **Spain + teaching:** IVA 0%. Note: "Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992". IRPF row at the settings rate (7%) with the reduced-rate note.
- **Spain + other service:** IVA 21% and the same IRPF row and note.
- **EU (not Spain):** VAT 0%. Notes: "VAT reverse-charged – Article 196 EU VAT Directive" and "IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)". Warns if the client has no VAT ID line.
- **Outside the EU:** no VAT. Note: "Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA".
- **Withholding:** a per-client rate (for example Matinno = 10.21% labelled "WITHHOLDING TAX RATE"), taken from that client's last invoice. Off by default for new clients.

## Pages (Tailwind + shadcn/ui, react-hook-form + zod)

- `/`: invoice list (number, client, date, total, currency), searchable and sorted by newest. Each row has Sheet ↗ and PDF ⬇ buttons, plus a "Sync" button.
- `/invoices/[id]`: parsed details (client, items, totals, notes, bank) with Open in Sheets and Download PDF.
- `/invoices/new`:
  - Client dropdown (from the Index) or "New client" (name, address/ID lines as a textarea, country). Picking a client pre-fills currency, terms, service type, withholding and bank.
  - Number field pre-filled with `nextNumber` for the issue date's month. It can be edited and warns on duplicates.
  - Line items (1–8 rows), with live totals and notes shown as you edit.
  - Bank dropdown (from the Index) or "New account" (label + lines).
  - Submitting creates the sheet, updates the Index, and redirects to the detail page.
- `/settings`: sender block, IRPF rate, and the one-time setup/migration button.

## Repo & deployment

- `create-next-app` (TS, App Router, Tailwind) in `/Users/kleinyann/github/yann-invoice`; `git init`.
- Env: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL`, `INVOICES_FOLDER_ID`, `INDEX_SHEET_ID`, `TEMPLATE_SHEET_ID`.
- Google Cloud: enable the Drive and Sheets APIs and create an OAuth Web client. Redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://invoice.yannklein.dev/api/auth/callback/google`.
- `Dockerfile` (Next `output: 'standalone'`) → Coolify app on `invoice.yannklein.dev`.
- The design spec is also saved to `docs/superpowers/specs/2026-10-04-invoice-app-design.md`, with an implementation plan alongside it.

## Build order (TDD for the pure modules)

1. Scaffold, auth with the allowlist, and a Google client wrapper.
2. `parse.ts`, using fixtures exported from about 6 real sheets (ES/FR/PL/JP, legacy 2021, the Matinno variant) in `tests/fixtures/`.
3. `numbering.ts`, `taxRules.ts`, `totals.ts` with Vitest unit tests.
4. `setup.ts`, run with a dry-run first. Moving files changes nothing for anyone who opens the existing links.
5. Index store and sync, then the list and detail pages, then the PDF route.
6. Template creation, `write.ts`, and the new-invoice form.
7. Dockerfile and Coolify deploy.

## Verification

- `npm test`: the parser fixtures reproduce the known values (202609003 → total €93.00; 202606004 → ¥404,055; LA LOCO → country France, the FR bank). Numbering: `[202609002..005]` + 2026-09-30 → `202609006`; empty month → `…001`; `202608001b` is ignored for the highest number.
- Local run (`npm run dev`):
  - Run setup as a dry-run and check the list of files, then run it for real and confirm the `Invoices` folder in Drive has all 55 files.
  - The list page shows every invoice, and the client and bank dropdowns are filled.
  - Create a test invoice for Le Wagon Spain. Check that the number is `202610001`, the IRPF row and notes are there, and the Sheet looks the same as 202609003.
  - Download the PDF and check it visually.
  - Edit a cell in Sheets, press Sync, and check the detail page updates.
  - Delete the test invoice afterwards.
- After deploying: sign in on `invoice.yannklein.dev` with the allowed account, and confirm that any other Google account is refused.
