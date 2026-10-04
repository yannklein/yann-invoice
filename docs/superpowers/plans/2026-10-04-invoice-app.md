# Invoice App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private Next.js website that creates Yann's invoices as Google Sheets in one Drive folder, using his invoice history for client, bank, numbering and tax-note defaults. It lists invoices, shows their details, links to each Sheet, and downloads PDFs.

**Architecture:** Next.js App Router server components call the Google Drive and Sheets APIs with Yann's own OAuth token (Auth.js v5, Google provider, one allowlisted email).
- **Pure logic** lives in `src/lib/invoice/*` and `src/lib/index/rows.ts` and is unit-tested with Vitest against fixtures transcribed from real invoices: parsing, numbering, tax rules, totals, client/bank derivation, and the write plan.
- **API access** lives in `src/lib/google/*`, `src/lib/index/store.ts` and `src/lib/setup.ts`, and is checked manually against the real Drive.
- **Invoice Index spreadsheet:** a cache that can be rebuilt from the invoice sheets at any time.

**Tech Stack:** Node 22, Next.js (latest, App Router, TypeScript, `src/` dir), Tailwind + shadcn/ui, Auth.js v5 (`next-auth@beta`), `googleapis`, `zod` v4, `react-hook-form` + `@hookform/resolvers`, Vitest, Docker → Coolify.

**Spec:** `docs/superpowers/specs/2026-10-04-invoice-app-design.md`

## Deviations from the spec (simplifications, flagged for Yann's review)

1. **No named ranges.** The template rows are found **by their labels** at write time, using the same `locate()` the parser uses. The template can be restyled in Sheets without breaking anything.
2. **The Index has two tabs, `Invoices` and `Settings`.** Clients and bank accounts are worked out in memory from `Invoices` on each request (newest invoice per client wins), so they can never be out of date.
3. **No folder, index or template IDs in env.** The app tags its own Drive files with a private `appProperties.yannInvoiceRole` (`folder` / `index` / `template` / `invoice`) and finds them by that tag. The only env vars are for auth.
4. **The sender block comes from the template sheet.** To change it, edit `Invoice Template` in Sheets. `Settings` only holds the IRPF rate and the default terms.
5. **The template is a plain copy of invoice 202609003.** Withholding rows are added (copied from the VAT rows) only when an invoice needs them. The IRPF row is removed when the IRPF rate is 0. VAT rows are always kept and show 0.00%, as in the history.
6. **New invoices record `country` and `serviceType` as appProperties on the file.** The client's country and service type are then exact next time, instead of being guessed from the address.

## Global Constraints

- Invoice number = `YYYYMM` of the **issue date** + a 3-digit counter that restarts each month and is shared by all clients (`202609005`). The suggestion can always be edited by hand (`202608001b`).
- Only `ALLOWED_EMAIL` (`yann.luc.klein@gmail.com`) can sign in. Every page and route calls `getGoogle()`, which redirects anyone without a valid session to sign-in.
- One Drive folder named `Invoices` holds every invoice sheet, plus `Invoice Template` and `Invoice Index`. The invoice sheets are the source of truth.
- Tax notes, character for character:
  - `- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.`
  - `- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales (primeros años de actividad).`
  - `VAT reverse-charged – Article 196 EU VAT Directive`
  - `IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)`
  - `Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA`
- Text cells are written with `valueInputOption: 'RAW'`. Only numbers and formulas use `'USER_ENTERED'`.
- Bulk Sheets reads (full sync) wait 1.1 s between reads to stay under the 60 reads/min/user quota.
- Money is rounded to the currency's minor unit: JPY 0 decimals, EUR/USD 2. Total = subtotal + VAT − IRPF − withholding.

## Review Focus

1. **Text that starts with `-`, `+` or `=`** (every Spanish note starts with `- `) must arrive in the sheet as text, not `#ERROR!`. Covered by a Task 7 test: notes go in the RAW batch and nothing starting with `- ` is in USER_ENTERED.
2. **A client whose name contains another country** ("Poland - Japan Foundation") must be detected by its **address** (Poland), not its name. Covered by Task 1 and Task 2 tests.
3. **Odd invoice numbers** (`202608001b`, `null`, `SPECIAL-1`) must not break the suggested next number, and duplicate checks ignore case and spaces. Covered by Task 3 tests.
4. **JPY amounts with fractions** (¥33,333 × 10.21%) must round to whole yen, the same way in the app and in the sheet's `ROUND(…,0)` formulas. Covered by Task 5 and Task 7 tests.
5. **Content longer than the template's rows** (an 8-line Japanese bank block, 5 notes, 6 client lines) must insert rows instead of overwriting the bank header or the DESCRIPTION header. Covered by Task 7 tests.

---

## File Map

```
src/auth.ts                          Auth.js config (Google, allowlist, token refresh)
src/types/next-auth.d.ts             Session/JWT type augmentation
src/lib/auth/allow.ts                isAllowedEmail()                         (pure)
src/lib/auth/refresh.ts              refreshGoogleToken()
src/lib/google/client.ts             getGoogle() → { drive, sheets, accessToken }
src/lib/google/drive.ts              roles, resolveIds/requireIds, listInvoiceFiles, readGrid
src/lib/google/writeInvoice.ts       createInvoiceSheet()                     (IO)
src/lib/invoice/types.ts             shared types + DEFAULT_SETTINGS
src/lib/invoice/cells.ts             grid normalisation, money/percent/date parsing (pure)
src/lib/invoice/countries.ts         COUNTRIES, isEU, detectCountry           (pure)
src/lib/invoice/layout.ts            locate() label finder                    (pure)
src/lib/invoice/parse.ts             parseInvoice()                           (pure)
src/lib/invoice/numbering.ts         nextNumber(), isDuplicate()              (pure)
src/lib/invoice/taxRules.ts          taxRulesFor(), hasTaxId(), irpfNote()    (pure)
src/lib/invoice/totals.ts            computeTotals(), roundMoney(), formatMoney() (pure)
src/lib/invoice/derive.ts            clients/banks from index rows            (pure)
src/lib/invoice/writePlan.ts         planStructure/planValues/planFormats/invoiceTitle (pure)
src/lib/invoice/schema.ts            zod form schema + toDraft()              (pure)
src/lib/invoice/pdf.ts               pdfExportUrl, pdfFileName, contentDisposition (pure)
src/lib/index/rows.ts                index row (de)serialisation, settings values, diffFiles (pure)
src/lib/index/store.ts               readIndex/writeIndex/readSettings/writeSettings/syncIndex (IO)
src/lib/setup.ts                     previewSetup()/runSetup()                (IO)
src/app/layout.tsx                   shell + nav + sign-out
src/app/page.tsx                     invoice list
src/app/invoices/[id]/page.tsx       invoice detail
src/app/invoices/new/page.tsx        loads defaults → <NewInvoiceForm>
src/app/invoices/new/NewInvoiceForm.tsx  client form
src/app/invoices/new/actions.ts      createInvoiceAction
src/app/settings/page.tsx            setup + settings + full resync
src/app/settings/actions.ts          runSetupAction/saveSettingsAction/fullResyncAction
src/app/api/auth/[...nextauth]/route.ts
src/app/api/invoices/[id]/pdf/route.ts
tests/fixtures/grids.ts              5 real invoices transcribed as cell grids
tests/*.test.ts
Dockerfile, .dockerignore, .env.example, README.md
```

---

### Task 1: Scaffold, cell helpers, countries

**Files:**
- Create: the Next.js scaffold (`package.json`, `src/app/*`, etc.), `vitest.config.ts`, `src/lib/invoice/types.ts`, `src/lib/invoice/cells.ts`, `src/lib/invoice/countries.ts`
- Test: `tests/cells.test.ts`, `tests/countries.test.ts`

**Interfaces:**
- Produces:
  - `Grid = string[][]`; column indices `A=0 … F=5`
  - `normalizeGrid(values: unknown[][] | null | undefined): Grid`
  - `parseMoney(s: string): number | null`
  - `parsePercent(s: string): number | null` (as a fraction, so `"10.21%"` → `0.1021`)
  - `parseDate(s: string): string | null` (returns `YYYY-MM-DD`)
  - `currencyOf(s: string): Currency | null`
  - `lastNonEmptyRow(grid: Grid, col: number): number` (returns −1 if there is none)
  - `COUNTRIES: Record<string,string>`, `isEU(code): boolean`, `detectCountry(lines: string[]): string` (ISO-2 code or `'unknown'`)
  - Types: `Currency`, `CURRENCIES`, `ServiceType`, `LineItem`, `ParsedInvoice`, `InvoiceDraft`, `Settings`, `DEFAULT_SETTINGS`

- [ ] **Step 1: Scaffold the app** (the repo already has `.git` and `docs/`)

```bash
cd /Users/kleinyann/github/yann-invoice
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
npm i next-auth@beta googleapis zod react-hook-form @hookform/resolvers
npm i -D vitest
npx shadcn@latest init -d
npx shadcn@latest add button input textarea label table card badge
```

If create-next-app refuses because the directory isn't empty, move `docs/` aside temporarily (`mv docs /tmp/yi-docs`), scaffold, then move it back.

- [ ] **Step 2: Configure Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

Add to the `package.json` scripts: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 3: Write `src/lib/invoice/types.ts`** (types only, nothing to test)

```ts
export type Currency = 'EUR' | 'JPY' | 'USD';
export const CURRENCIES: Currency[] = ['EUR', 'JPY', 'USD'];
export type ServiceType = 'teaching' | 'other';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Everything readable from one invoice sheet. Rates are fractions (0.07 = 7%). */
export interface ParsedInvoice {
  number: string | null;
  title: string;
  issueDate: string | null; // YYYY-MM-DD
  terms: string | null;
  senderLines: string[];
  clientName: string;
  clientLines: string[]; // first line = client name
  country: string; // ISO-2 or 'unknown'
  currency: Currency;
  items: LineItem[];
  subtotal: number | null;
  irpfRate: number;
  vatRate: number;
  withholdingRate: number;
  total: number | null;
  notes: string[];
  bankLines: string[];
}

/** Everything needed to write a new invoice sheet. */
export interface InvoiceDraft {
  number: string;
  issueDate: string; // YYYY-MM-DD
  terms: string;
  clientLines: string[];
  country: string;
  serviceType: ServiceType;
  currency: Currency;
  items: LineItem[];
  vatRate: number;
  irpfRate: number;
  withholdingRate: number;
  notes: string[];
  bankLines: string[];
}

export interface Settings {
  irpfRate: number;
  defaultTerms: string;
}

export const DEFAULT_SETTINGS: Settings = { irpfRate: 0.07, defaultTerms: 'Due upon receipt' };
```

- [ ] **Step 4: Write the failing tests**

`tests/cells.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeGrid, parseMoney, parsePercent, parseDate, currencyOf, lastNonEmptyRow } from '@/lib/invoice/cells';

describe('cells', () => {
  it('normalizes ragged rows to 6 trimmed string columns', () => {
    expect(normalizeGrid([['a', ' b '], [], [1, 2, 3, 4, 5, 6, 7]])).toEqual([
      ['a', 'b', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['1', '2', '3', '4', '5', '6'],
    ]);
    expect(normalizeGrid(undefined)).toEqual([]);
  });

  it('parses money in any of the historical formats', () => {
    expect(parseMoney('€1,500.00')).toBe(1500);
    expect(parseMoney('¥450,000')).toBe(450000);
    expect(parseMoney('USD$0')).toBe(0);
    expect(parseMoney('1.00')).toBe(1);
    expect(parseMoney('N/A')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('parses percentages as fractions', () => {
    expect(parsePercent('10.21%')).toBe(0.1021);
    expect(parsePercent('0.00%')).toBe(0);
    expect(parsePercent('IRPF (7%)')).toBe(0.07);
    expect(parsePercent('N/A')).toBeNull();
    expect(parsePercent('¥0')).toBeNull();
  });

  it('parses slash and dash dates', () => {
    expect(parseDate('2026/09/17')).toBe('2026-09-17');
    expect(parseDate('2026-9-7')).toBe('2026-09-07');
    expect(parseDate('Sep 17')).toBeNull();
  });

  it('detects currency from symbols', () => {
    expect(currencyOf('¥10,000')).toBe('JPY');
    expect(currencyOf('€75.00')).toBe('EUR');
    expect(currencyOf('USD$0')).toBe('USD');
    expect(currencyOf('1.00')).toBeNull();
  });

  it('finds the last non-empty row in a column', () => {
    expect(lastNonEmptyRow([['a'], [''], ['b'], ['']].map((r) => [...r, '', '', '', '', '']), 0)).toBe(2);
    expect(lastNonEmptyRow([], 0)).toBe(-1);
  });
});
```

`tests/countries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectCountry, isEU } from '@/lib/invoice/countries';

describe('detectCountry', () => {
  it('uses the address (last lines first), not the company name', () => {
    expect(
      detectCountry(['Poland - Japan Foundation', 'Tax ID (NIP): 5214079680', 'ul. Grzybowska 87', '00-844 Warsaw, Poland']),
    ).toBe('PL');
  });
  it('recognises cities, postal marks and VAT prefixes', () => {
    expect(detectCountry(['GALILEO GLOBAL EDUCATION 4', '8 rue des Pirogues de Bercy', 'FR7501.999908528', 'SIRET 99990852800014'])).toBe('FR');
    expect(detectCountry(['Steampunk Digital', '〒814-0001', 'Fukuoka-ken, Fukuoka-shi', '+81 80 3947 6874'])).toBe('JP');
    expect(detectCountry(['LE WAGON SPAIN, S.L', 'NIF ESB67094730', 'Calle de Hermosilla 48, 1D', '28001 Madrid, Spain'])).toBe('ES');
  });
  it('returns unknown when nothing matches', () => {
    expect(detectCountry(['Acme'])).toBe('unknown');
  });
});

describe('isEU', () => {
  it('knows EU members', () => {
    expect(isEU('FR')).toBe(true);
    expect(isEU('ES')).toBe(true);
    expect(isEU('JP')).toBe(false);
    expect(isEU('GB')).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests to check they fail**

Run: `npx vitest run tests/cells.test.ts tests/countries.test.ts`
Expected: FAIL, with "Failed to resolve import '@/lib/invoice/cells'".

- [ ] **Step 6: Implement**

`src/lib/invoice/cells.ts`:

```ts
import type { Currency } from './types';

export type Grid = string[][];
export const A = 0, B = 1, C = 2, D = 3, E = 4, F = 5;
const COLS = 6;

export function normalizeGrid(values: unknown[][] | null | undefined): Grid {
  return (values ?? []).map((row) =>
    Array.from({ length: COLS }, (_, i) => String(row?.[i] ?? '').trim()),
  );
}

export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parsePercent(s: string): number | null {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return Math.round(Number(m[1]) * 1e4) / 1e6;
}

export function parseDate(s: string): string | null {
  const m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function currencyOf(s: string): Currency | null {
  if (/[¥￥]|JPY/.test(s)) return 'JPY';
  if (/€|EUR/.test(s)) return 'EUR';
  if (/\$|USD/.test(s)) return 'USD';
  return null;
}

export function lastNonEmptyRow(grid: Grid, col: number): number {
  for (let r = grid.length - 1; r >= 0; r--) if (grid[r][col]) return r;
  return -1;
}
```

`src/lib/invoice/countries.ts`:

```ts
export const COUNTRIES: Record<string, string> = {
  AT: 'Austria', AU: 'Australia', BE: 'Belgium', BG: 'Bulgaria', CA: 'Canada', CH: 'Switzerland',
  CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', ES: 'Spain',
  FI: 'Finland', FR: 'France', GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia', HU: 'Hungary',
  IE: 'Ireland', IT: 'Italy', JP: 'Japan', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia',
  MT: 'Malta', NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden',
  SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', US: 'United States',
};

const EU = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export const isEU = (code: string) => EU.has(code);

const EXTRA: [string, RegExp][] = [
  ['JP', /tokyo|osaka|fukuoka|〒|日本/i],
  ['ES', /españa|madrid|barcelona/i],
  ['FR', /paris|\bFR\d/i],
  ['PL', /polska|warsaw|warszawa/i],
  ['AU', /melbourne|sydney/i],
  ['DE', /deutschland|berlin/i],
  ['GB', /\bUK\b|london/i],
  ['US', /\bUSA\b/i],
];

const PATTERNS: [string, RegExp][] = [
  ...Object.entries(COUNTRIES).map(([code, name]): [string, RegExp] => [code, new RegExp(`\\b${name}\\b`, 'i')]),
  ...EXTRA,
];

/** Address lines are checked from the bottom up, so a company *name* never wins over the address. */
export function detectCountry(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const [code, re] of PATTERNS) if (re.test(lines[i])) return code;
  }
  return 'unknown';
}
```

- [ ] **Step 7: Run the tests to check they pass**

Run: `npx vitest run tests/cells.test.ts tests/countries.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with cell helpers and country detection"
```

---

### Task 2: Layout locator and invoice parser

**Files:**
- Create: `src/lib/invoice/layout.ts`, `src/lib/invoice/parse.ts`, `tests/fixtures/grids.ts`
- Test: `tests/parse.test.ts`

**Interfaces:**
- Consumes: `normalizeGrid`, `parseMoney`, `parsePercent`, `parseDate`, `currencyOf`, column constants, `detectCountry`, `ParsedInvoice`
- Produces:
  - `Layout` (0-based row indices, each `number | null`): `fromRow, numberRow, clientRow, issueDateRow, termsRow, descriptionRow, subtotalRow, irpfRow, vatRateRow, vatAmountRow, whtRateRow, whtAmountRow, totalRow, notesRow, bankRow`
  - `locate(grid: Grid): Layout`
  - `parseInvoice(values: unknown[][], title: string): ParsedInvoice`
  - Fixtures `ES_202609003`, `JP_MATINNO_202606004`, `FR_LALOCO_202601001`, `PL_PLJ_202608003`, `JP_STEAMPUNK_2021` (`string[][]`)

- [ ] **Step 1: Transcribe the fixtures**

These were read from the real sheets on 2026-10-04. Merged cells hold their value only in the top-left cell, which is also how the Sheets API returns them.

`tests/fixtures/grids.ts`:

```ts
type Col = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type Rows = Record<number, Partial<Record<Col, string>>>;

/** Build a 6-column grid from 1-based sparse rows. */
export function sparse(rows: Rows, height: number): string[][] {
  const g = Array.from({ length: height }, () => Array<string>(6).fill(''));
  for (const [r, cells] of Object.entries(rows)) {
    for (const [c, v] of Object.entries(cells)) g[Number(r) - 1]['ABCDEF'.indexOf(c)] = v ?? '';
  }
  return g;
}

const fill = (from: number, to: number, F: string): Rows =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { F }]));

const HEADER = { A: 'DESCRIPTION', D: 'QUANTITY', E: 'UNIT PRICE', F: 'AMOUNT' };

/** "Invoice Le Wagon Spain - 202609003" — Spain, teaching, IRPF 7%. Also the template source. */
export const ES_202609003 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202609003', E: 'Carrer de Sant Roc 35 BJ IN 2' },
  3: { E: 'Barcelona, 08014' },
  4: { E: 'SPAIN' },
  5: { E: 'Tax ID:', F: 'Z3059655Q' },
  6: { E: 'VAT ID:', F: 'ESZ3059655Q' },
  7: { A: 'Invoice For:', B: 'LE WAGON SPAIN, S.L' },
  8: { B: 'NIF ESB67094730', D: 'Issue Date', E: '2026/09/17' },
  9: { B: 'Calle de Hermosilla 48, 1D', D: 'Terms', E: 'Due 45 days after receipt' },
  10: { B: '28001 Madrid, Spain' },
  13: HEADER,
  14: { A: 'Talk during Open House event: Bootcamp content presentation as teacher - Sep 8 2026', D: '1.00', E: '€100.00', F: '€100.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€100.00' },
  24: { E: 'IRPF (7%)', F: '€7.00' },
  25: { A: 'IVA/VAT RATE', F: '0.00%' },
  26: { E: 'IVA/VAT', F: '€0.00' },
  27: { A: 'AMOUNT DUE', F: '€93.00' },
  29: { A: 'Notes' },
  30: { A: '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.' },
  31: { A: '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales' },
  32: { A: '(primeros años de actividad).' },
  33: { A: '- Bank account details:' },
  34: { A: 'Name: YANN LUC KLEIN' },
  35: { A: 'Bank name: Caixabank' },
  36: { A: 'BIC/SWIFT Code : CAIXESBBXXX' },
  37: { A: 'IBAN: ES93 2100 0802 4807 0003 1447' },
}, 37);

/** "Invoice Matinno - June 2026 - 202606004" — Japan, ¥, 10.21% withholding, JP bank block. */
export const JP_MATINNO_202606004 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { E: 'Carrer de Sant Roc 35, bajos 2' },
  3: { E: '08014, SPAIN' },
  4: { E: '+33 7 59 69 64 81' },
  5: { A: 'Invoice no: 202606004', E: 'yann.klein@me.com' },
  6: { E: 'NIE: Z3059655Q' },
  7: { A: 'Invoice For:', B: 'New Normdesign. Inc' },
  8: { B: '〒103-0027', D: 'Issue Date', E: '2026/06/30' },
  9: { B: 'Tokyo , Nihonbashi, 3-1-3', D: 'Terms', E: 'Due upon receipt' },
  10: { B: '+81 80 4326 0935' },
  11: { B: 'Company no: 010401161343' },
  13: HEADER,
  14: { A: 'Development of Matinno application during the month', D: '1.00', E: '¥450,000', F: '¥450,000' },
  ...fill(16, 22, '¥0'),
  23: { A: 'SUBTOTAL', F: '¥450,000' },
  24: { E: 'VAT/IVA', F: '0.00%' },
  25: { A: 'WITHHOLDING TAX RATE', F: '10.21%' },
  26: { E: 'TAX', F: '¥45,945' },
  27: { A: 'TOTAL after withholding tax', F: '¥404,055' },
  29: { A: 'Notes' },
  30: { A: 'Operación no sujeta a IVA — Art. 69 Ley 37/1992' },
  31: { A: '- Bank account details:' },
  32: { A: '• 銀行名（Bank Name）: SMBC信託銀行 PRESTIA（エスエムビーシーシンタクギンコウ プレミア）' },
  33: { A: '• 金融機関コード（Bank Code）: 0300' },
  34: { A: '• 支店名（Branch Name）: 渋谷支店（シブヤ）' },
  35: { A: '• 支店コード（Branch Code）: 033' },
  36: { A: '• 口座種別（Account Type）: 普通預金（Futsuu – Regular Savings）' },
  37: { A: '• 口座番号（Account Number）: 1093731' },
  38: { A: '• 口座名義（Account Holder’s Name）: YANN LUC KLEIN（ヤン ルック クライン）' },
}, 38);

/** "Invoice LA LOCO SAS - Jan 2026 - 202601001" — France, reverse charge, Crédit Mutuel. */
export const FR_LALOCO_202601001 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202601001', E: 'Carrer de Sant Roc 35 BJ IN 2' },
  3: { E: 'Barcelona, 08014' },
  4: { E: 'SPAIN' },
  5: { E: 'Tax ID:', F: 'Z3059655Q' },
  7: { A: 'Invoice For:', B: 'LA LOCO SAS' },
  8: { B: 'VAT: FR20810930123', D: 'Issue Date', E: '2026/09/15' },
  9: { B: '24 rue Louis Blanc', D: 'Terms', E: 'Due upon receipt' },
  10: { B: 'PARIS 75010, FRANCE' },
  13: HEADER,
  14: { A: 'Content translation and presentation of the "Build an AI agent with n8n & Slack" remote workshop of January 13th 2026.', D: '1.00', E: '€250.00', F: '€250.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€250.00' },
  24: { A: 'VAT RATE', F: '0.00%' },
  25: { E: 'VAT', F: '€0.00' },
  26: { A: 'AMOUNT DUE', F: '€250.00' },
  28: { A: 'Notes' },
  29: { A: 'VAT reverse-charged – Article 196 EU VAT Directive' },
  30: { A: 'IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)' },
  32: { A: '- Bank account details:' },
  33: { A: 'Name: YANN LUC KLEIN' },
  34: { A: 'Bank name: Credit Mutuel' },
  35: { A: 'BIC/SWIFT Code : CMCIFR2A' },
  36: { A: 'IBAN: FR76 1027 8054 5200 0741 0744 087' },
}, 36);

/**
 * "Invoice PLJ - 202608003" — Poland. A client cell with an embedded newline, an "IRPF" row at €0.00,
 * and a NIE sender line. Only rows 1–31 were readable, so there is NO bank section (a real-world gap the parser must tolerate).
 */
export const PL_PLJ_202608003 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202608003', E: 'Carrer de Sant Roc 35, BJ IN 2' },
  3: { E: '08014 Barcelona, SPAIN' },
  4: { E: 'NIE:', F: 'Z3059655Q' },
  5: { E: 'VAT ID:', F: 'ESZ3059655Q' },
  7: { A: 'Invoice For:', B: 'Poland - Japan Foundation' },
  8: { B: 'Tax ID (NIP): 5214079680\nKRS: 0001115824', D: 'Issue Date', E: '2026/09/13' },
  9: { B: 'ul. Grzybowska 87', D: 'Terms', E: 'Due 14 days after receipt' },
  10: { B: '00-844 Warsaw, Poland' },
  13: HEADER,
  14: { A: 'Second payment (50%), Service Agreement No. 06/2026, digital and mobile publication for the Poland–Japan Foundation.', D: '1.00', E: '€530.00', F: '€530.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€530.00' },
  24: { E: 'IRPF', F: '€0.00' },
  25: { A: 'IVA/VAT RATE', F: '0.00%' },
  26: { E: 'IVA/VAT', F: '€0.00' },
  27: { A: 'AMOUNT DUE', F: '€530.00' },
  29: { A: 'Notes' },
  30: { A: '- VAT reverse-charged – Article 196 EU VAT Directive' },
  31: { A: '- Amount invoiced in EUR. Payment in PLN per Section 4 of Service Agreement No. 06/2026.' },
}, 31);

/** "Invoice Steampunk Digital - CoffeeCam for iPhone" (2021) — no number anywhere, "TAX RATE ¥0". */
export const JP_STEAMPUNK_2021 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { E: '153-0065' },
  3: { E: 'Tokyo-to Meguro-ku Nakacho 1-8-25-201' },
  4: { E: 'JAPAN' },
  5: { E: '+81 90 1731 1845' },
  7: { A: 'Invoice For:', B: 'Steampunk Digital' },
  8: { B: '〒814-0001', D: 'Issue Date', E: '2021/08/26' },
  9: { B: 'Fukuoka-ken, Fukuoka-shi, Sawara-ku Momochihama, 3-Chome 8-33', D: 'Terms', E: 'Due upon receipt' },
  10: { B: '+81 80 3947 6874' },
  13: HEADER,
  14: { A: 'Development to adapt CoffeeCam for iPhone', D: '8.00', E: '¥7,000', F: '¥56,000' },
  ...fill(16, 22, '¥0'),
  23: { A: 'SUBTOTAL', F: '¥56,000' },
  24: { A: 'TAX RATE', F: '¥0' },
  25: { E: 'TAX' },
  26: { A: 'AMOUNT DUE', F: '¥56,000' },
  28: { A: 'Notes' },
  29: { A: '- Bank account details:' },
  30: { A: 'Name: クライン　ヤンルツク (Klein Yann Luc)' },
  31: { A: 'Bank name: 新生銀行 (Shinsei Bank)' },
  32: { A: 'Branch: 本店(400) (Head office)' },
  33: { A: 'BIC/SWIFT Code : LTCBJPJT' },
  34: { A: 'Account number: 2122024 ( フ Normal/Savings Account)' },
}, 34);
```

- [ ] **Step 2: Write the failing tests**

`tests/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { locate } from '@/lib/invoice/layout';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, JP_MATINNO_202606004, FR_LALOCO_202601001, PL_PLJ_202608003, JP_STEAMPUNK_2021 } from './fixtures/grids';

describe('locate', () => {
  it('finds every labelled row of the template (0-based)', () => {
    expect(locate(ES_202609003)).toEqual({
      fromRow: 0, numberRow: 1, clientRow: 6, issueDateRow: 7, termsRow: 8, descriptionRow: 12,
      subtotalRow: 22, irpfRow: 23, vatRateRow: 24, vatAmountRow: 25, whtRateRow: null, whtAmountRow: null,
      totalRow: 26, notesRow: 28, bankRow: 32,
    });
  });
  it('handles the Matinno variant (VAT/IVA rate in column E, withholding rows)', () => {
    const L = locate(JP_MATINNO_202606004);
    expect(L.numberRow).toBe(4);
    expect(L.vatRateRow).toBe(23);
    expect(L.vatAmountRow).toBeNull();
    expect(L.whtRateRow).toBe(24);
    expect(L.whtAmountRow).toBe(25);
    expect(L.totalRow).toBe(26);
    expect(L.irpfRow).toBeNull();
  });
});

describe('parseInvoice', () => {
  it('parses a Spanish teaching invoice', () => {
    const inv = parseInvoice(ES_202609003, 'Invoice Le Wagon Spain - 202609003');
    expect(inv).toMatchObject({
      number: '202609003', issueDate: '2026-09-17', terms: 'Due 45 days after receipt',
      clientName: 'LE WAGON SPAIN, S.L', country: 'ES', currency: 'EUR',
      subtotal: 100, irpfRate: 0.07, vatRate: 0, withholdingRate: 0, total: 93,
    });
    expect(inv.items).toEqual([{ description: 'Talk during Open House event: Bootcamp content presentation as teacher - Sep 8 2026', quantity: 1, unitPrice: 100 }]);
    expect(inv.clientLines).toHaveLength(4);
    expect(inv.senderLines).toContain('Tax ID: Z3059655Q');
    expect(inv.notes).toHaveLength(3);
    expect(inv.notes[0]).toMatch(/^- Operación exenta/);
    expect(inv.bankLines).toEqual(['Name: YANN LUC KLEIN', 'Bank name: Caixabank', 'BIC/SWIFT Code : CAIXESBBXXX', 'IBAN: ES93 2100 0802 4807 0003 1447']);
  });

  it('parses a Japanese invoice with withholding', () => {
    const inv = parseInvoice(JP_MATINNO_202606004, 'Invoice Matinno - June 2026 - 202606004');
    expect(inv).toMatchObject({ number: '202606004', country: 'JP', currency: 'JPY', subtotal: 450000, vatRate: 0, irpfRate: 0, total: 404055, clientName: 'New Normdesign. Inc' });
    expect(inv.withholdingRate).toBeCloseTo(0.1021, 6);
    expect(inv.notes).toEqual(['Operación no sujeta a IVA — Art. 69 Ley 37/1992']);
    expect(inv.bankLines).toHaveLength(7);
  });

  it('parses a French reverse-charge invoice', () => {
    const inv = parseInvoice(FR_LALOCO_202601001, 'Invoice LA LOCO SAS - Jan 2026 - 202601001');
    expect(inv).toMatchObject({ number: '202601001', country: 'FR', issueDate: '2026-09-15', total: 250 });
    expect(inv.notes).toHaveLength(2);
    expect(inv.bankLines[1]).toBe('Bank name: Credit Mutuel');
  });

  it('splits multi-line cells, detects Poland despite "Japan" in the name, tolerates a missing bank section', () => {
    const inv = parseInvoice(PL_PLJ_202608003, 'Invoice PLJ - 202608003');
    expect(inv.country).toBe('PL');
    expect(inv.clientLines).toEqual(['Poland - Japan Foundation', 'Tax ID (NIP): 5214079680', 'KRS: 0001115824', 'ul. Grzybowska 87', '00-844 Warsaw, Poland']);
    expect(inv.senderLines).toContain('NIE: Z3059655Q');
    expect(inv.irpfRate).toBe(0);
    expect(inv.bankLines).toEqual([]);
    expect(inv.notes).toHaveLength(2);
  });

  it('parses a 2021 legacy invoice with no number', () => {
    const inv = parseInvoice(JP_STEAMPUNK_2021, 'Invoice Steampunk Digital - CoffeeCam for iPhone');
    expect(inv).toMatchObject({ number: null, country: 'JP', currency: 'JPY', vatRate: 0, total: 56000, clientName: 'Steampunk Digital', issueDate: '2021-08-26' });
    expect(inv.items[0]).toEqual({ description: 'Development to adapt CoffeeCam for iPhone', quantity: 8, unitPrice: 7000 });
    expect(inv.notes).toEqual([]);
    expect(inv.bankLines).toHaveLength(5);
  });

  it('falls back to the number at the end of the file title', () => {
    expect(parseInvoice(JP_STEAMPUNK_2021, 'Invoice Le Wagon Spain - Aug 2026 - 202608001b').number).toBe('202608001b');
  });

  it('survives an empty sheet', () => {
    const inv = parseInvoice([], 'Invoice Something');
    expect(inv).toMatchObject({ number: null, clientName: 'Something', items: [], total: null, country: 'unknown', currency: 'EUR' });
  });
});
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/invoice/layout.ts`**

```ts
import { A, D, E, type Grid } from './cells';

export interface Layout {
  fromRow: number | null;
  numberRow: number | null;
  clientRow: number | null;
  issueDateRow: number | null;
  termsRow: number | null;
  descriptionRow: number | null;
  subtotalRow: number | null;
  irpfRow: number | null;
  vatRateRow: number | null;
  vatAmountRow: number | null;
  whtRateRow: number | null;
  whtAmountRow: number | null;
  totalRow: number | null;
  notesRow: number | null;
  bankRow: number | null;
}

/** Find each section of an invoice sheet by its label. All rows are 0-based. */
export function locate(grid: Grid): Layout {
  const find = (pred: (row: string[]) => boolean, from = 0, to = grid.length): number | null => {
    for (let r = Math.max(0, from); r < Math.min(to, grid.length); r++) if (pred(grid[r])) return r;
    return null;
  };

  const fromRow = find((r) => /^From:?$/i.test(r[D]), 0, 10);
  const numberRow = find((r) => /^(No\.|Invoice no:)/i.test(r[A]), 0, 10);
  const clientRow = find((r) => /^Invoice For:?$/i.test(r[A]));
  const issueDateRow = find((r) => /^Issue Date$/i.test(r[D]));
  const termsRow = find((r) => /^Terms$/i.test(r[D]));
  const descriptionRow = find((r) => /^DESCRIPTION$/i.test(r[A]));
  const subtotalRow = find((r) => /^SUBTOTAL$/i.test(r[A]), descriptionRow ?? 0);
  const after = subtotalRow ?? grid.length;
  const totalRow = find((r) => /^(AMOUNT DUE|TOTAL)/i.test(r[A]), after);
  const end = totalRow ?? grid.length;
  const irpfRow = find((r) => /^IRPF/i.test(r[E]), after, end);
  const whtRateRow = find((r) => /WITHHOLDING TAX RATE/i.test(r[A]), after, end);
  const vatRateRow = find(
    (r) => (/(VAT|TAX) RATE/i.test(r[A]) && !/WITHHOLDING/i.test(r[A])) || /^VAT\/IVA$/i.test(r[E]),
    after,
    end,
  );
  const vatAmountRow =
    vatRateRow == null ? null : find((r) => /^(IVA\/VAT|VAT|TAX)$/i.test(r[E]), vatRateRow + 1, whtRateRow ?? end);
  const whtAmountRow =
    whtRateRow == null ? null : find((r) => /^(WITHHOLDING|TAX)$/i.test(r[E]), whtRateRow + 1, end);
  const notesRow = find((r) => /^Notes$/i.test(r[A]), end);
  const bankRow = find((r) => /^-?\s*Bank account details/i.test(r[A]), end);

  return {
    fromRow, numberRow, clientRow, issueDateRow, termsRow, descriptionRow, subtotalRow, irpfRow,
    vatRateRow, vatAmountRow, whtRateRow, whtAmountRow, totalRow, notesRow, bankRow,
  };
}
```

- [ ] **Step 5: Implement `src/lib/invoice/parse.ts`**

```ts
import { A, B, D, E, F, currencyOf, normalizeGrid, parseDate, parseMoney, parsePercent, type Grid } from './cells';
import { detectCountry } from './countries';
import { locate } from './layout';
import type { Currency, LineItem, ParsedInvoice } from './types';

const NUMBER_IN_CELL = /(?:No\.|Invoice no:)\s*([0-9A-Za-z-]+)/i;
const NUMBER_IN_TITLE = /(\d{9}[a-z]?)\s*$/i;

function linesIn(grid: Grid, from: number, to: number, col: number): string[] {
  const out: string[] = [];
  for (let r = Math.max(0, from); r < Math.min(to, grid.length); r++) {
    for (const part of grid[r][col].split('\n')) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function parseInvoice(values: unknown[][], title: string): ParsedInvoice {
  const g = normalizeGrid(values);
  const L = locate(g);
  const cell = (row: number | null, col: number) => (row == null ? '' : g[row][col]);

  const number = cell(L.numberRow, A).match(NUMBER_IN_CELL)?.[1] ?? title.match(NUMBER_IN_TITLE)?.[1] ?? null;

  const senderLines: string[] = [];
  if (L.fromRow != null) {
    for (let r = L.fromRow; r < (L.clientRow ?? L.fromRow + 8) && r < g.length; r++) {
      const t = [g[r][E], g[r][F]].filter(Boolean).join(' ');
      if (t) senderLines.push(t);
    }
  }

  const clientLines =
    L.clientRow == null ? [] : linesIn(g, L.clientRow, L.descriptionRow ?? L.clientRow + 6, B);

  const items: LineItem[] = [];
  let itemCurrency: Currency | null = null;
  if (L.descriptionRow != null) {
    for (let r = L.descriptionRow + 1; r < (L.subtotalRow ?? g.length); r++) {
      const description = g[r][A];
      if (!description) continue;
      itemCurrency ??= currencyOf(g[r][E]) ?? currencyOf(g[r][F]);
      items.push({ description, quantity: parseMoney(g[r][D]) ?? 1, unitPrice: parseMoney(g[r][E]) ?? 0 });
    }
  }
  const currency: Currency =
    itemCurrency ?? currencyOf(cell(L.subtotalRow, F)) ?? currencyOf(cell(L.totalRow, F)) ?? 'EUR';

  const subtotal = parseMoney(cell(L.subtotalRow, F));
  let irpfRate = 0;
  if (L.irpfRow != null) {
    const amount = parseMoney(g[L.irpfRow][F]);
    irpfRate =
      parsePercent(g[L.irpfRow][E]) ??
      (subtotal && amount != null ? Math.round((amount / subtotal) * 1e6) / 1e6 : 0);
  }

  return {
    number,
    title,
    issueDate: parseDate(cell(L.issueDateRow, E)),
    terms: cell(L.termsRow, E) || null,
    senderLines,
    clientName: clientLines[0] ?? title.replace(/^Invoice\s+/i, '').trim(),
    clientLines,
    country: detectCountry(clientLines),
    currency,
    items,
    subtotal,
    irpfRate,
    vatRate: parsePercent(cell(L.vatRateRow, F)) ?? 0,
    withholdingRate: parsePercent(cell(L.whtRateRow, F)) ?? 0,
    total: parseMoney(cell(L.totalRow, F)),
    notes: L.notesRow == null ? [] : linesIn(g, L.notesRow + 1, L.bankRow ?? g.length, A),
    bankLines: L.bankRow == null ? [] : linesIn(g, L.bankRow + 1, g.length, A),
  };
}
```

- [ ] **Step 6: Run the tests to check they pass**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invoice/layout.ts src/lib/invoice/parse.ts tests/fixtures/grids.ts tests/parse.test.ts
git commit -m "feat: label-based invoice sheet parser with real-invoice fixtures"
```

---

### Task 3: Invoice numbering

**Files:**
- Create: `src/lib/invoice/numbering.ts`
- Test: `tests/numbering.test.ts`

**Interfaces:**
- Produces:
  - `nextNumber(existing: (string | null)[], issueDate: string /* YYYY-MM-DD */): string`
  - `isDuplicate(existing: (string | null)[], candidate: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { isDuplicate, nextNumber } from '@/lib/invoice/numbering';

describe('nextNumber', () => {
  it('continues the counter of the issue month', () => {
    expect(nextNumber(['202609002', '202609003', '202609004', '202609005'], '2026-09-30')).toBe('202609006');
  });
  it('starts at 001 in a new month', () => {
    expect(nextNumber(['202609005'], '2026-10-01')).toBe('202610001');
    expect(nextNumber([], '2026-10-04')).toBe('202610001');
  });
  it('counts suffixed numbers by their counter and ignores junk', () => {
    expect(nextNumber(['202608001b', '202608003', null, 'SPECIAL-1', '2026080'], '2026-08-31')).toBe('202608004');
    expect(nextNumber(['202608001b'], '2026-08-02')).toBe('202608002');
  });
  it('uses the issue date month, not other months', () => {
    expect(nextNumber(['202609007', '202608002'], '2026-08-20')).toBe('202608003');
  });
});

describe('isDuplicate', () => {
  it('compares trimmed and case-insensitively', () => {
    expect(isDuplicate(['202609003'], ' 202609003 ')).toBe(true);
    expect(isDuplicate(['202608001B'], '202608001b')).toBe(true);
    expect(isDuplicate(['202609003', null], '202609004')).toBe(false);
    expect(isDuplicate([], '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/numbering.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** YYYYMM of the issue date + (highest 3-digit counter already used in that month) + 1. */
export function nextNumber(existing: (string | null)[], issueDate: string): string {
  const prefix = issueDate.slice(0, 4) + issueDate.slice(5, 7);
  let max = 0;
  for (const n of existing) {
    const m = n?.match(/^(\d{6})(\d{3})/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return prefix + String(max + 1).padStart(3, '0');
}

export function isDuplicate(existing: (string | null)[], candidate: string): boolean {
  const c = candidate.trim().toLowerCase();
  return c !== '' && existing.some((n) => n?.trim().toLowerCase() === c);
}
```

- [ ] **Step 4: Run the test to check it passes**

Run: `npx vitest run tests/numbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice/numbering.ts tests/numbering.test.ts
git commit -m "feat: YYYYMMXXX invoice numbering"
```

---

### Task 4: Tax rules

**Files:**
- Create: `src/lib/invoice/taxRules.ts`
- Test: `tests/taxRules.test.ts`

**Interfaces:**
- Consumes: `isEU`, `ServiceType`, `Settings`
- Produces:
  - `NOTES` (constant strings)
  - `irpfNote(rate: number): string`
  - `hasTaxId(lines: string[]): boolean`
  - `TaxInput { country: string; serviceType: ServiceType; withholdingRate: number; clientLines: string[] }`
  - `TaxResult { vatRate: number; irpfRate: number; withholdingRate: number; notes: string[]; warnings: string[] }`
  - `taxRulesFor(input: TaxInput, settings: Settings): TaxResult`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { NOTES, hasTaxId, taxRulesFor } from '@/lib/invoice/taxRules';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

const base = { withholdingRate: 0, clientLines: ['Client', 'VAT: XX123456789'] };

describe('taxRulesFor', () => {
  it('Spain + teaching: IVA exempt, IRPF at the settings rate', () => {
    const t = taxRulesFor({ ...base, country: 'ES', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(t).toEqual({
      vatRate: 0, irpfRate: 0.07, withholdingRate: 0, warnings: [],
      notes: [
        '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.',
        '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales (primeros años de actividad).',
      ],
    });
  });

  it('Spain + other service: 21% IVA plus IRPF (general rate wording when not 7%)', () => {
    const t = taxRulesFor({ ...base, country: 'ES', serviceType: 'other' }, { ...DEFAULT_SETTINGS, irpfRate: 0.15 });
    expect(t.vatRate).toBe(0.21);
    expect(t.irpfRate).toBe(0.15);
    expect(t.notes).toEqual(['- Retención del IRPF del 15% conforme a la normativa vigente.']);
  });

  it('EU (not Spain): reverse charge in EN + ES, warning without a VAT ID', () => {
    const ok = taxRulesFor({ ...base, country: 'FR', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(ok).toMatchObject({ vatRate: 0, irpfRate: 0, warnings: [] });
    expect(ok.notes).toEqual([NOTES.reverseChargeEn, NOTES.reverseChargeEs]);
    const missing = taxRulesFor({ ...base, clientLines: ['Some GmbH', 'Berlin'], country: 'DE', serviceType: 'other' }, DEFAULT_SETTINGS);
    expect(missing.warnings).toHaveLength(1);
  });

  it('outside the EU: not subject (Art. 69), per-client withholding passes through', () => {
    const t = taxRulesFor({ ...base, country: 'JP', serviceType: 'other', withholdingRate: 0.1021 }, DEFAULT_SETTINGS);
    expect(t).toEqual({ vatRate: 0, irpfRate: 0, withholdingRate: 0.1021, notes: [NOTES.notSubject], warnings: [] });
  });

  it('unknown country: no notes and a warning', () => {
    const t = taxRulesFor({ ...base, country: 'unknown', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(t.notes).toEqual([]);
    expect(t.warnings).toHaveLength(1);
  });
});

describe('hasTaxId', () => {
  it('recognises VAT/NIF/NIP lines and bare VAT numbers', () => {
    expect(hasTaxId(['LA LOCO SAS', 'VAT: FR20810930123'])).toBe(true);
    expect(hasTaxId(['PLJ', 'Tax ID (NIP): 5214079680'])).toBe(true);
    expect(hasTaxId(['GALILEO', 'FR7501.999908528'])).toBe(true);
    expect(hasTaxId(['Some GmbH', 'Berlin'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/taxRules.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { isEU } from './countries';
import type { ServiceType, Settings } from './types';

export const NOTES = {
  esExempt: '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.',
  reverseChargeEn: 'VAT reverse-charged – Article 196 EU VAT Directive',
  reverseChargeEs: 'IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)',
  notSubject: 'Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA',
} as const;

const pct = (rate: number) => String(+(rate * 100).toFixed(2));

export function irpfNote(rate: number): string {
  if (Math.abs(rate - 0.07) < 1e-9) {
    return '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales (primeros años de actividad).';
  }
  return `- Retención del IRPF del ${pct(rate)}% conforme a la normativa vigente.`;
}

export function hasTaxId(lines: string[]): boolean {
  return lines.some(
    (l) => /\b(VAT|NIF|CIF|TVA|NIP|SIRET|USt-?IdNr)\b/i.test(l) || /^[A-Z]{2}[0-9A-Z]{2}[0-9A-Z.]{6,}$/.test(l.trim()),
  );
}

export interface TaxInput {
  country: string;
  serviceType: ServiceType;
  withholdingRate: number;
  clientLines: string[];
}

export interface TaxResult {
  vatRate: number;
  irpfRate: number;
  withholdingRate: number;
  notes: string[];
  warnings: string[];
}

export function taxRulesFor(input: TaxInput, settings: Settings): TaxResult {
  const { country, serviceType, withholdingRate } = input;
  const base = { withholdingRate, warnings: [] as string[] };

  if (country === 'ES') {
    const irpfRate = settings.irpfRate;
    return serviceType === 'teaching'
      ? { ...base, vatRate: 0, irpfRate, notes: [NOTES.esExempt, irpfNote(irpfRate)] }
      : { ...base, vatRate: 0.21, irpfRate, notes: [irpfNote(irpfRate)] };
  }
  if (isEU(country)) {
    const warnings = hasTaxId(input.clientLines) ? [] : ["EU reverse charge needs the client's VAT ID in the client details."];
    return { ...base, vatRate: 0, irpfRate: 0, notes: [NOTES.reverseChargeEn, NOTES.reverseChargeEs], warnings };
  }
  if (country === 'unknown' || !/^[A-Z]{2}$/.test(country)) {
    return { ...base, vatRate: 0, irpfRate: 0, notes: [], warnings: ['Pick the client country to get the legal notes.'] };
  }
  return { ...base, vatRate: 0, irpfRate: 0, notes: [NOTES.notSubject] };
}
```

- [ ] **Step 4: Run the test to check it passes**

Run: `npx vitest run tests/taxRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice/taxRules.ts tests/taxRules.test.ts
git commit -m "feat: country and service tax rules with legal notes"
```

---

### Task 5: Totals and money formatting

**Files:**
- Create: `src/lib/invoice/totals.ts`
- Test: `tests/totals.test.ts`

**Interfaces:**
- Consumes: `Currency`, `LineItem`
- Produces:
  - `Rates { vatRate; irpfRate; withholdingRate }`
  - `Totals { subtotal; vat; irpf; withholding; total }`
  - `decimalsFor(c: Currency): 0 | 2`
  - `roundMoney(x: number, c: Currency): number`
  - `computeTotals(items: LineItem[], rates: Rates, currency: Currency): Totals`
  - `formatMoney(x: number, c: Currency): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computeTotals, formatMoney } from '@/lib/invoice/totals';

const item = (quantity: number, unitPrice: number) => ({ description: 'x', quantity, unitPrice });

describe('computeTotals', () => {
  it('matches 202609003 (IRPF 7%)', () => {
    expect(computeTotals([item(1, 100)], { vatRate: 0, irpfRate: 0.07, withholdingRate: 0 }, 'EUR')).toEqual({ subtotal: 100, vat: 0, irpf: 7, withholding: 0, total: 93 });
  });
  it('matches 202606004 (JPY, 10.21% withholding)', () => {
    expect(computeTotals([item(1, 450000)], { vatRate: 0, irpfRate: 0, withholdingRate: 0.1021 }, 'JPY')).toEqual({ subtotal: 450000, vat: 0, irpf: 0, withholding: 45945, total: 404055 });
  });
  it('rounds JPY to whole yen', () => {
    const t = computeTotals([item(1, 33333)], { vatRate: 0, irpfRate: 0, withholdingRate: 0.1021 }, 'JPY');
    expect(t.withholding).toBe(3403);
    expect(t.total).toBe(29930);
  });
  it('Spain + other: 21% IVA added, IRPF subtracted', () => {
    expect(computeTotals([item(2, 75)], { vatRate: 0.21, irpfRate: 0.07, withholdingRate: 0 }, 'EUR')).toEqual({ subtotal: 150, vat: 31.5, irpf: 10.5, withholding: 0, total: 171 });
  });
  it('avoids float noise in subtotals', () => {
    expect(computeTotals([item(3, 0.1)], { vatRate: 0, irpfRate: 0, withholdingRate: 0 }, 'EUR').subtotal).toBe(0.3);
  });
});

describe('formatMoney', () => {
  it('formats like the historical sheets', () => {
    expect(formatMoney(93, 'EUR')).toBe('€93.00');
    expect(formatMoney(404055, 'JPY')).toBe('¥404,055');
    expect(formatMoney(1500, 'EUR')).toBe('€1,500.00');
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/totals.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { Currency, LineItem } from './types';

export interface Rates {
  vatRate: number;
  irpfRate: number;
  withholdingRate: number;
}

export interface Totals {
  subtotal: number;
  vat: number;
  irpf: number;
  withholding: number;
  total: number;
}

export const decimalsFor = (c: Currency): 0 | 2 => (c === 'JPY' ? 0 : 2);

export function roundMoney(x: number, c: Currency): number {
  const f = 10 ** decimalsFor(c);
  return Math.round((x + Number.EPSILON) * f) / f;
}

export function computeTotals(items: LineItem[], rates: Rates, currency: Currency): Totals {
  const r = (x: number) => roundMoney(x, currency);
  const subtotal = r(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
  const vat = r(subtotal * rates.vatRate);
  const irpf = r(subtotal * rates.irpfRate);
  const withholding = r(subtotal * rates.withholdingRate);
  return { subtotal, vat, irpf, withholding, total: r(subtotal + vat - irpf - withholding) };
}

export function formatMoney(x: number, c: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(x);
}
```

- [ ] **Step 4: Run the test to check it passes**

Run: `npx vitest run tests/totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice/totals.ts tests/totals.test.ts
git commit -m "feat: invoice totals with per-currency rounding"
```

---

### Task 6: Index rows, client and bank derivation

**Files:**
- Create: `src/lib/invoice/derive.ts`, `src/lib/index/rows.ts`
- Test: `tests/derive.test.ts`, `tests/rows.test.ts`

**Interfaces:**
- Consumes: `ParsedInvoice`, `ServiceType`, `Currency`, `Settings`, `DEFAULT_SETTINGS`, `parseInvoice` (tests only), fixtures
- Produces, in `derive.ts`:
  - `InvoiceMeta { country?: string; serviceType?: ServiceType }`
  - `IndexRow { fileId: string; title: string; modifiedTime: string; meta: InvoiceMeta; invoice: ParsedInvoice }`
  - `ClientProfile { key; name; lines: string[]; country; currency: Currency; terms; serviceType: ServiceType; withholdingRate: number; bankLines: string[]; lastIssueDate: string }`
  - `BankAccount { key: string; label: string; lines: string[] }`
  - `clientKey(name)`, `effectiveCountry(row)`, `effectiveServiceType(row)`, `sortNewest(rows)`, `deriveClients(rows)`, `deriveBanks(rows)`, `bankLabel(lines)`
- Produces, in `rows.ts`:
  - `INDEX_HEADER: string[]`
  - `rowToValues(row: IndexRow): (string | number)[]`
  - `valuesToRow(v: unknown[]): IndexRow | null`
  - `settingsFromValues(values: unknown[][]): Settings`
  - `settingsToValues(s: Settings): string[][]`
  - `DriveInvoiceFile { id: string; name: string; modifiedTime: string; appProperties: Record<string, string> }`
  - `metaFromAppProperties(p): InvoiceMeta`
  - `diffFiles(files: DriveInvoiceFile[], rows: IndexRow[], full: boolean): { toParse: DriveInvoiceFile[]; kept: IndexRow[]; changed: boolean }`

- [ ] **Step 1: Write the failing tests**

`tests/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bankLabel, clientKey, deriveBanks, deriveClients, effectiveServiceType, sortNewest, type IndexRow } from '@/lib/invoice/derive';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, FR_LALOCO_202601001, JP_MATINNO_202606004 } from './fixtures/grids';

const row = (fileId: string, grid: string[][], title: string, patch: Partial<IndexRow['invoice']> = {}, meta: IndexRow['meta'] = {}): IndexRow => ({
  fileId, title, modifiedTime: '2026-10-01T00:00:00.000Z', meta, invoice: { ...parseInvoice(grid, title), ...patch },
});

const es = row('es', ES_202609003, 'Invoice Le Wagon Spain - 202609003');
const esOld = row('es-old', ES_202609003, 'Invoice Le Wagon Spain - 202509001', { issueDate: '2025-09-01', number: '202509001', terms: 'Due upon receipt', clientName: 'Le Wagon Spain S.L.' });
const fr = row('fr', FR_LALOCO_202601001, 'Invoice LA LOCO SAS - Jan 2026 - 202601001');
const jp = row('jp', JP_MATINNO_202606004, 'Invoice Matinno - June 2026 - 202606004');

describe('clientKey', () => {
  it('ignores case and punctuation', () => {
    expect(clientKey('LE WAGON SPAIN, S.L')).toBe(clientKey('Le Wagon Spain S.L.'));
    expect(clientKey('株式会社テスト')).not.toBe('');
  });
});

describe('deriveClients', () => {
  it('keeps one profile per client, from the newest invoice', () => {
    const clients = deriveClients([esOld, es, fr, jp]);
    expect(clients.map((c) => c.name)).toEqual(['LA LOCO SAS', 'LE WAGON SPAIN, S.L', 'New Normdesign. Inc']);
    const lw = clients.find((c) => c.name === 'LE WAGON SPAIN, S.L')!;
    expect(lw).toMatchObject({ country: 'ES', terms: 'Due 45 days after receipt', serviceType: 'teaching', withholdingRate: 0, currency: 'EUR' });
    expect(lw.bankLines[1]).toBe('Bank name: Caixabank');
    expect(clients.find((c) => c.name === 'New Normdesign. Inc')!.withholdingRate).toBeCloseTo(0.1021);
  });
  it('prefers appProperties meta over guesses', () => {
    const tagged = row('t', JP_MATINNO_202606004, 'Invoice X - 202610001', { issueDate: '2026-10-02' }, { country: 'SG', serviceType: 'other' });
    expect(deriveClients([jp, tagged])[0]).toMatchObject({ country: 'SG', serviceType: 'other' });
  });
});

describe('effectiveServiceType', () => {
  it('Spanish invoice with IVA > 0 is "other", otherwise "teaching"', () => {
    expect(effectiveServiceType({ ...es, invoice: { ...es.invoice, vatRate: 0.21 } })).toBe('other');
    expect(effectiveServiceType(es)).toBe('teaching');
  });
});

describe('sortNewest', () => {
  it('sorts by issue date, then number, descending', () => {
    expect(sortNewest([esOld, jp, es]).map((r) => r.fileId)).toEqual(['es', 'jp', 'es-old']);
  });
});

describe('banks', () => {
  it('labels banks with name and last 4 of the account', () => {
    expect(bankLabel(es.invoice.bankLines)).toBe('Caixabank ····1447');
    expect(bankLabel(jp.invoice.bankLines)).toBe('SMBC信託銀行 PRESTIA ····3731');
    expect(bankLabel(['Account number: 2122024 ( フ Normal/Savings Account)', 'Bank name: 新生銀行 (Shinsei Bank)'])).toBe('新生銀行 ····2024');
  });
  it('dedupes identical blocks, newest first', () => {
    const banks = deriveBanks([esOld, es, fr, jp]);
    expect(banks.map((b) => b.label)).toEqual(['Caixabank ····1447', 'Credit Mutuel ····4087', 'SMBC信託銀行 PRESTIA ····3731']);
  });
});
```

`tests/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diffFiles, metaFromAppProperties, rowToValues, settingsFromValues, settingsToValues, valuesToRow } from '@/lib/index/rows';
import { parseInvoice } from '@/lib/invoice/parse';
import type { IndexRow } from '@/lib/invoice/derive';
import { ES_202609003 } from './fixtures/grids';

const row = (fileId: string, modifiedTime: string): IndexRow => ({ fileId, title: 't', modifiedTime, meta: { country: 'ES' }, invoice: parseInvoice(ES_202609003, 't') });

describe('index rows', () => {
  it('round-trips through sheet values', () => {
    const r = row('a', 'm1');
    expect(valuesToRow(rowToValues(r).map(String))).toEqual(r);
  });
  it('drops rows with broken JSON instead of crashing', () => {
    expect(valuesToRow(['a', 't', 'm', '', '', '', '', '', '{}', 'not json'])).toBeNull();
  });
});

describe('settings values', () => {
  it('parses with defaults', () => {
    expect(settingsFromValues([['irpfRate', '0.15'], ['defaultTerms', 'Net 30']])).toEqual({ irpfRate: 0.15, defaultTerms: 'Net 30' });
    expect(settingsFromValues([['irpfRate', '']])).toEqual({ irpfRate: 0.07, defaultTerms: 'Due upon receipt' });
    expect(settingsFromValues(settingsToValues({ irpfRate: 0.07, defaultTerms: 'X' }))).toEqual({ irpfRate: 0.07, defaultTerms: 'X' });
  });
});

describe('metaFromAppProperties', () => {
  it('keeps only known keys', () => {
    expect(metaFromAppProperties({ country: 'JP', serviceType: 'other', yannInvoiceRole: 'invoice' })).toEqual({ country: 'JP', serviceType: 'other' });
    expect(metaFromAppProperties({ serviceType: 'bogus' })).toEqual({});
    expect(metaFromAppProperties(undefined)).toEqual({});
  });
});

describe('diffFiles', () => {
  const files = [
    { id: 'a', name: 'A', modifiedTime: 'm1', appProperties: {} },
    { id: 'b', name: 'B', modifiedTime: 'm2', appProperties: {} },
    { id: 'c', name: 'C', modifiedTime: 'm3', appProperties: {} },
  ];
  it('re-parses new and modified files, drops deleted ones', () => {
    const d = diffFiles(files, [row('a', 'm1'), row('b', 'old'), row('d', 'm4')], false);
    expect(d.toParse.map((f) => f.id)).toEqual(['b', 'c']);
    expect(d.kept.map((r) => r.fileId)).toEqual(['a']);
    expect(d.changed).toBe(true);
  });
  it('reports no change when everything matches', () => {
    expect(diffFiles(files.slice(0, 1), [row('a', 'm1')], false)).toMatchObject({ toParse: [], changed: false });
  });
  it('full mode re-parses everything', () => {
    expect(diffFiles(files, [row('a', 'm1')], true).toParse).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run tests/derive.test.ts tests/rows.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/invoice/derive.ts`**

```ts
import type { Currency, ParsedInvoice, ServiceType } from './types';

export interface InvoiceMeta {
  country?: string;
  serviceType?: ServiceType;
}

export interface IndexRow {
  fileId: string;
  title: string;
  modifiedTime: string;
  meta: InvoiceMeta;
  invoice: ParsedInvoice;
}

export interface ClientProfile {
  key: string;
  name: string;
  lines: string[];
  country: string;
  currency: Currency;
  terms: string;
  serviceType: ServiceType;
  withholdingRate: number;
  bankLines: string[];
  lastIssueDate: string;
}

export interface BankAccount {
  key: string;
  label: string;
  lines: string[];
}

export const clientKey = (name: string) =>
  name.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const effectiveCountry = (r: IndexRow) => r.meta.country ?? r.invoice.country;

export function effectiveServiceType(r: IndexRow): ServiceType {
  if (r.meta.serviceType) return r.meta.serviceType;
  return effectiveCountry(r) === 'ES' && r.invoice.vatRate > 0 ? 'other' : 'teaching';
}

const sortDate = (r: IndexRow) => r.invoice.issueDate ?? r.modifiedTime.slice(0, 10);

export function sortNewest(rows: IndexRow[]): IndexRow[] {
  return [...rows].sort(
    (a, b) => sortDate(b).localeCompare(sortDate(a)) || (b.invoice.number ?? '').localeCompare(a.invoice.number ?? ''),
  );
}

export function deriveClients(rows: IndexRow[]): ClientProfile[] {
  const seen = new Map<string, ClientProfile>();
  for (const r of sortNewest(rows)) {
    const key = clientKey(r.invoice.clientName);
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      key,
      name: r.invoice.clientName,
      lines: r.invoice.clientLines,
      country: effectiveCountry(r),
      currency: r.invoice.currency,
      terms: r.invoice.terms ?? '',
      serviceType: effectiveServiceType(r),
      withholdingRate: r.invoice.withholdingRate,
      bankLines: r.invoice.bankLines,
      lastIssueDate: sortDate(r),
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function bankLabel(lines: string[]): string {
  const tail = (l?: string) => l?.split(/[:：]/).slice(1).join(':').trim() ?? '';
  const bank = tail(lines.find((l) => /bank\s*name/i.test(l))).replace(/\s*[（(].*$/, '').trim();
  const account = tail(lines.find((l) => /IBAN|account\s*number/i.test(l)));
  const token = account.match(/[A-Z]{2}\d{2}[\d\s]+|\d[\d\s-]*/i)?.[0].replace(/[^0-9A-Z]/gi, '') ?? '';
  const last4 = token.slice(-4);
  return `${bank || lines[0] || 'Bank account'}${last4 ? ` ····${last4}` : ''}`;
}

export function deriveBanks(rows: IndexRow[]): BankAccount[] {
  const seen = new Map<string, BankAccount>();
  for (const r of sortNewest(rows)) {
    const lines = r.invoice.bankLines;
    const key = lines.join('\n');
    if (!lines.length || seen.has(key)) continue;
    seen.set(key, { key, label: bankLabel(lines), lines });
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Implement `src/lib/index/rows.ts`**

```ts
import type { IndexRow, InvoiceMeta } from '@/lib/invoice/derive';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/invoice/types';

export const INDEX_HEADER = ['fileId', 'title', 'modifiedTime', 'number', 'client', 'issueDate', 'currency', 'total', 'meta', 'invoice'];

export function rowToValues(r: IndexRow): (string | number)[] {
  return [
    r.fileId, r.title, r.modifiedTime, r.invoice.number ?? '', r.invoice.clientName, r.invoice.issueDate ?? '',
    r.invoice.currency, r.invoice.total ?? '', JSON.stringify(r.meta), JSON.stringify(r.invoice),
  ];
}

export function valuesToRow(v: unknown[]): IndexRow | null {
  try {
    const s = v.map((x) => String(x ?? ''));
    if (!s[0] || !s[9]) return null;
    return { fileId: s[0], title: s[1], modifiedTime: s[2], meta: JSON.parse(s[8] || '{}'), invoice: JSON.parse(s[9]) };
  } catch {
    return null;
  }
}

export function settingsFromValues(values: unknown[][]): Settings {
  const m = new Map(values.map((v) => [String(v[0] ?? ''), String(v[1] ?? '').trim()]));
  const irpfRaw = m.get('irpfRate');
  const irpf = irpfRaw ? Number(irpfRaw) : NaN;
  return {
    irpfRate: Number.isFinite(irpf) ? irpf : DEFAULT_SETTINGS.irpfRate,
    defaultTerms: m.get('defaultTerms') || DEFAULT_SETTINGS.defaultTerms,
  };
}

export function settingsToValues(s: Settings): string[][] {
  return [['irpfRate', String(s.irpfRate)], ['defaultTerms', s.defaultTerms]];
}

export interface DriveInvoiceFile {
  id: string;
  name: string;
  modifiedTime: string;
  appProperties: Record<string, string>;
}

export function metaFromAppProperties(p: Record<string, string> | undefined | null): InvoiceMeta {
  const meta: InvoiceMeta = {};
  if (p?.country && /^[A-Z]{2}$/.test(p.country)) meta.country = p.country;
  if (p?.serviceType === 'teaching' || p?.serviceType === 'other') meta.serviceType = p.serviceType;
  return meta;
}

export function diffFiles(files: DriveInvoiceFile[], rows: IndexRow[], full: boolean) {
  const byId = new Map(rows.map((r) => [r.fileId, r]));
  const kept: IndexRow[] = [];
  const toParse: DriveInvoiceFile[] = [];
  for (const f of files) {
    const existing = full ? undefined : byId.get(f.id);
    if (existing && existing.modifiedTime === f.modifiedTime) kept.push(existing);
    else toParse.push(f);
  }
  return { toParse, kept, changed: toParse.length > 0 || kept.length !== rows.length };
}
```

- [ ] **Step 5: Run the tests to check they pass**

Run: `npx vitest run tests/derive.test.ts tests/rows.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoice/derive.ts src/lib/index/rows.ts tests/derive.test.ts tests/rows.test.ts
git commit -m "feat: index row serialisation and client/bank derivation"
```

---

### Task 7: Write plan (template → new invoice, pure)

**Files:**
- Create: `src/lib/invoice/writePlan.ts`
- Test: `tests/writePlan.test.ts`

**Interfaces:**
- Consumes: `Layout`, `locate`, `Grid`, `lastNonEmptyRow`, column constants, `InvoiceDraft`, `Currency`, `decimalsFor`
- Produces:
  - `ValueRange { range: string; values: (string | number)[][] }` (A1 ranges without a sheet name)
  - `planStructure(layout: Layout, grid: Grid, d: InvoiceDraft, sheetId: number): sheets_v4.Schema$Request[]`
  - `planValues(layout: Layout, grid: Grid, d: InvoiceDraft): { raw: ValueRange[]; entered: ValueRange[] }`
  - `planFormats(layout: Layout, d: InvoiceDraft, sheetId: number): sheets_v4.Schema$Request[]`
  - `invoiceTitle(d: InvoiceDraft): string`

How it's used, so the tests make sense: copy the template, read the grid, apply `planStructure` (inserts and deletes, bottom-up), **re-read the grid**, then apply `planValues` (RAW batch, then USER_ENTERED batch) and finally `planFormats`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { locate } from '@/lib/invoice/layout';
import { invoiceTitle, planFormats, planStructure, planValues } from '@/lib/invoice/writePlan';
import type { InvoiceDraft } from '@/lib/invoice/types';
import { ES_202609003 } from './fixtures/grids';

const SHEET = 7;
const draft = (patch: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  number: '202610001', issueDate: '2026-10-04', terms: 'Due 45 days after receipt',
  clientLines: ['LE WAGON SPAIN, S.L', 'NIF ESB67094730', 'Calle de Hermosilla 48, 1D', '28001 Madrid, Spain'],
  country: 'ES', serviceType: 'teaching', currency: 'EUR',
  items: [{ description: 'Teaching', quantity: 1, unitPrice: 100 }],
  vatRate: 0, irpfRate: 0.07, withholdingRate: 0,
  notes: ['- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.', '- Se aplica retención reducida…'],
  bankLines: ['Name: YANN LUC KLEIN', 'Bank name: Caixabank', 'BIC/SWIFT Code : CAIXESBBXXX', 'IBAN: ES93 2100 0802 4807 0003 1447'],
  ...patch,
});
const L = locate(ES_202609003);
const insert = (at: number, n: number) => ({ insertDimension: { range: { sheetId: SHEET, dimension: 'ROWS', startIndex: at, endIndex: at + n }, inheritFromBefore: true } });

describe('planStructure', () => {
  it('needs no structural change when the draft fits the template', () => {
    expect(planStructure(L, ES_202609003, draft(), SHEET)).toEqual([]);
  });

  it('adds withholding rows (copied from VAT rows) and removes IRPF, bottom-up', () => {
    const reqs = planStructure(L, ES_202609003, draft({ irpfRate: 0, withholdingRate: 0.1021 }), SHEET);
    expect(reqs[0]).toEqual(insert(26, 2));
    expect(reqs[1]).toMatchObject({ copyPaste: { source: { startRowIndex: 24, endRowIndex: 26 }, destination: { startRowIndex: 26, endRowIndex: 28 } } });
    expect(reqs[2]).toMatchObject({ updateCells: { start: { rowIndex: 26, columnIndex: 0 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'WITHHOLDING TAX RATE' } }] }] } });
    expect(reqs[3]).toMatchObject({ updateCells: { start: { rowIndex: 27, columnIndex: 4 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'WITHHOLDING' } }] }] } });
    expect(reqs[4]).toEqual({ deleteDimension: { range: { sheetId: SHEET, dimension: 'ROWS', startIndex: 23, endIndex: 24 } } });
  });

  it('inserts rows for long bank blocks, notes and client details instead of overwriting headers', () => {
    const reqs = planStructure(L, ES_202609003, draft({
      bankLines: Array.from({ length: 8 }, (_, i) => `bank ${i}`),
      notes: ['1', '2', '3', '4', '5'],
      clientLines: ['a', 'b', 'c', 'd', 'e', 'f'],
    }), SHEET);
    expect(reqs).toEqual([insert(37, 4), insert(32, 2), insert(11, 1)]);
  });

  it('refuses a template without the IRPF row when IRPF is needed', () => {
    const noIrpf = ES_202609003.map((r, i) => (i === 23 ? ['', '', '', '', '', ''] : r));
    expect(() => planStructure(locate(noIrpf), noIrpf, draft(), SHEET)).toThrow(/IRPF/);
  });
});

describe('planValues', () => {
  const find = (list: { range: string; values: (string | number)[][] }[], range: string) => list.find((v) => v.range === range)?.values;

  it('writes text RAW and numbers/formulas USER_ENTERED at the located cells', () => {
    const { raw, entered } = planValues(L, ES_202609003, draft());
    expect(find(raw, 'A2')).toEqual([['No. 202610001']]);
    expect(find(raw, 'B7:B11')).toEqual([['LE WAGON SPAIN, S.L'], ['NIF ESB67094730'], ['Calle de Hermosilla 48, 1D'], ['28001 Madrid, Spain'], ['']]);
    expect(find(raw, 'E8')).toEqual([['2026/10/04']]);
    expect(find(raw, 'A14:A22')?.[0]).toEqual(['Teaching']);
    expect(find(entered, 'D14:F22')?.slice(0, 2)).toEqual([[1, 100, '=D14*E14'], ['', '', '']]);
    expect(find(entered, 'F23')).toEqual([['=SUM(F14:F22)']]);
    expect(find(raw, 'E24')).toEqual([['IRPF (7%)']]);
    expect(find(entered, 'F24')).toEqual([['=ROUND(F23*0.07,2)']]);
    expect(find(entered, 'F25')).toEqual([[0]]);
    expect(find(entered, 'F26')).toEqual([['=ROUND(F23*F25,2)']]);
    expect(find(raw, 'A27')).toEqual([['AMOUNT DUE']]);
    expect(find(entered, 'F27')).toEqual([['=F23+F26-F24']]);
    expect(find(raw, 'A30:A32')?.[0][0]).toMatch(/^- Operación/);
    expect(find(raw, 'A34:A37')?.[3]).toEqual(['IBAN: ES93 2100 0802 4807 0003 1447']);
  });

  it('never sends dash-prefixed text through USER_ENTERED', () => {
    const { entered } = planValues(L, ES_202609003, draft());
    const strings = entered.flatMap((v) => v.values.flat()).filter((x): x is string => typeof x === 'string');
    expect(strings.every((s) => s === '' || s.startsWith('='))).toBe(true);
  });

  it('uses 0 decimals for JPY', () => {
    const { entered } = planValues(L, ES_202609003, draft({ currency: 'JPY' }));
    expect(find(entered, 'F24')).toEqual([['=ROUND(F23*0.07,0)']]);
  });

  it('fills withholding rows after structure added them', () => {
    const grown = [...ES_202609003.slice(0, 26), ['WITHHOLDING TAX RATE', '', '', '', '', ''], ['', '', '', '', 'WITHHOLDING', ''], ...ES_202609003.slice(26)];
    const { raw, entered } = planValues(locate(grown), grown, draft({ withholdingRate: 0.1021 }));
    expect(find(entered, 'F27')).toEqual([[0.1021]]);
    expect(find(entered, 'F28')).toEqual([['=ROUND(F23*F27,2)']]);
    expect(find(raw, 'A29')).toEqual([['TOTAL after withholding tax']]);
    expect(find(entered, 'F29')).toEqual([['=F23+F26-F24-F28']]);
  });

  it('rejects more items than the template holds', () => {
    const items = Array.from({ length: 10 }, () => ({ description: 'x', quantity: 1, unitPrice: 1 }));
    expect(() => planValues(L, ES_202609003, draft({ items }))).toThrow(/items/);
  });
});

describe('planFormats', () => {
  it('applies the currency pattern to money cells and percent to rates', () => {
    const reqs = planFormats(L, draft({ currency: 'JPY' }), SHEET);
    const formats = reqs.map((r) => r.repeatCell!.cell!.userEnteredFormat!.numberFormat!);
    expect(formats.filter((f) => f.type === 'CURRENCY').every((f) => f.pattern === '"¥"#,##0')).toBe(true);
    expect(formats.filter((f) => f.type === 'PERCENT')).toHaveLength(1);
  });
});

describe('invoiceTitle', () => {
  it('follows the historical naming', () => {
    expect(invoiceTitle(draft())).toBe('Invoice LE WAGON SPAIN, S.L - Oct 2026 - 202610001');
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/writePlan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { sheets_v4 } from 'googleapis';
import { A, E, F, lastNonEmptyRow, type Grid } from './cells';
import type { Layout } from './layout';
import { decimalsFor } from './totals';
import type { Currency, InvoiceDraft } from './types';

export interface ValueRange {
  range: string;
  values: (string | number)[][];
}
type Request = sheets_v4.Schema$Request;

const REQUIRED = [
  'numberRow', 'clientRow', 'issueDateRow', 'termsRow', 'descriptionRow', 'subtotalRow',
  'vatRateRow', 'vatAmountRow', 'totalRow', 'notesRow', 'bankRow',
] as const;
type Located = Layout & { [K in (typeof REQUIRED)[number]]: number };

function need(L: Layout): Located {
  for (const k of REQUIRED) if (L[k] == null) throw new Error(`Invoice template is missing the "${k}" row`);
  return L as Located;
}

const insertRows = (sheetId: number, at: number, count: number): Request => ({
  insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: at, endIndex: at + count }, inheritFromBefore: true },
});
const deleteRows = (sheetId: number, from: number, to: number): Request => ({
  deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: from, endIndex: to } },
});
const copyRows = (sheetId: number, from: number, to: number, dest: number): Request => ({
  copyPaste: {
    source: { sheetId, startRowIndex: from, endRowIndex: to, startColumnIndex: 0, endColumnIndex: 6 },
    destination: { sheetId, startRowIndex: dest, endRowIndex: dest + (to - from), startColumnIndex: 0, endColumnIndex: 6 },
    pasteType: 'PASTE_NORMAL',
  },
});
const setText = (sheetId: number, rowIndex: number, columnIndex: number, text: string): Request => ({
  updateCells: {
    start: { sheetId, rowIndex, columnIndex },
    rows: [{ values: [{ userEnteredValue: { stringValue: text } }] }],
    fields: 'userEnteredValue',
  },
});

const bankCapacity = (grid: Grid, L: Located) => Math.max(0, lastNonEmptyRow(grid, A) - L.bankRow);

/** Row inserts/deletes, ordered bottom-up so each request's row indices are still valid. */
export function planStructure(layout: Layout, grid: Grid, d: InvoiceDraft, sheetId: number): Request[] {
  const L = need(layout);
  const reqs: Request[] = [];

  const bankHave = bankCapacity(grid, L);
  if (d.bankLines.length > bankHave) reqs.push(insertRows(sheetId, L.bankRow + 1 + bankHave, d.bankLines.length - bankHave));

  const notesHave = L.bankRow - L.notesRow - 1;
  if (d.notes.length > notesHave) reqs.push(insertRows(sheetId, L.bankRow, d.notes.length - notesHave));

  if (d.withholdingRate > 0 && L.whtRateRow == null) {
    if (L.vatAmountRow !== L.vatRateRow + 1) throw new Error('Invoice template VAT rows must be adjacent');
    const at = L.vatAmountRow + 1;
    reqs.push(
      insertRows(sheetId, at, 2),
      copyRows(sheetId, L.vatRateRow, L.vatAmountRow + 1, at),
      setText(sheetId, at, A, 'WITHHOLDING TAX RATE'),
      setText(sheetId, at + 1, E, 'WITHHOLDING'),
    );
  }
  if (d.withholdingRate === 0 && L.whtRateRow != null) {
    reqs.push(deleteRows(sheetId, L.whtRateRow, (L.whtAmountRow ?? L.whtRateRow) + 1));
  }

  if (d.irpfRate > 0 && L.irpfRow == null) throw new Error('Invoice template has no IRPF row');
  if (d.irpfRate === 0 && L.irpfRow != null) reqs.push(deleteRows(sheetId, L.irpfRow, L.irpfRow + 1));

  const clientHave = L.descriptionRow - 1 - L.clientRow;
  if (d.clientLines.length > clientHave) reqs.push(insertRows(sheetId, L.descriptionRow - 1, d.clientLines.length - clientHave));

  return reqs;
}

const pad = (lines: string[], n: number) => [...lines, ...Array<string>(Math.max(0, n - lines.length)).fill('')];
const pct = (rate: number) => String(+(rate * 100).toFixed(2));

/** Cell values for a grid that already has the right rows (call after planStructure + re-read). */
export function planValues(layout: Layout, grid: Grid, d: InvoiceDraft): { raw: ValueRange[]; entered: ValueRange[] } {
  const L = need(layout);
  const raw: ValueRange[] = [];
  const entered: ValueRange[] = [];
  const column = (col: string, from: number, lines: string[]) => {
    if (lines.length) raw.push({ range: `${col}${from + 1}:${col}${from + lines.length}`, values: lines.map((v) => [v]) });
  };

  raw.push({ range: `A${L.numberRow + 1}`, values: [[`No. ${d.number}`]] });

  const clientCap = L.descriptionRow - 1 - L.clientRow;
  if (d.clientLines.length > clientCap) throw new Error('Too many client lines for the template');
  column('B', L.clientRow, pad(d.clientLines, clientCap));
  raw.push({ range: `E${L.issueDateRow + 1}`, values: [[d.issueDate.replaceAll('-', '/')]] });
  raw.push({ range: `E${L.termsRow + 1}`, values: [[d.terms]] });

  const itemStart = L.descriptionRow + 1;
  const itemCap = L.subtotalRow - itemStart;
  if (d.items.length > itemCap) throw new Error(`Too many items: the template holds ${itemCap}`);
  column('A', itemStart, pad(d.items.map((i) => i.description), itemCap));
  entered.push({
    range: `D${itemStart + 1}:F${itemStart + itemCap}`,
    values: Array.from({ length: itemCap }, (_, i) => {
      const it = d.items[i];
      const r = itemStart + i + 1;
      return it ? [it.quantity, it.unitPrice, `=D${r}*E${r}`] : ['', '', ''];
    }),
  });

  const dp = decimalsFor(d.currency);
  const sub = L.subtotalRow + 1;
  entered.push({ range: `F${sub}`, values: [[`=SUM(F${itemStart + 1}:F${itemStart + itemCap})`]] });

  const minus: string[] = [];
  if (L.irpfRow != null) {
    const r = L.irpfRow + 1;
    raw.push({ range: `E${r}`, values: [[`IRPF (${pct(d.irpfRate)}%)`]] });
    entered.push({ range: `F${r}`, values: [[`=ROUND(F${sub}*${d.irpfRate},${dp})`]] });
    minus.push(`F${r}`);
  }
  const vr = L.vatRateRow + 1;
  const va = L.vatAmountRow + 1;
  entered.push({ range: `F${vr}`, values: [[d.vatRate]] }, { range: `F${va}`, values: [[`=ROUND(F${sub}*F${vr},${dp})`]] });

  const hasWht = L.whtRateRow != null && L.whtAmountRow != null;
  if (hasWht) {
    const wr = L.whtRateRow! + 1;
    const wa = L.whtAmountRow! + 1;
    raw.push({ range: `A${wr}`, values: [['WITHHOLDING TAX RATE']] }, { range: `E${wa}`, values: [['WITHHOLDING']] });
    entered.push({ range: `F${wr}`, values: [[d.withholdingRate]] }, { range: `F${wa}`, values: [[`=ROUND(F${sub}*F${wr},${dp})`]] });
    minus.push(`F${wa}`);
  }
  const tr = L.totalRow + 1;
  raw.push({ range: `A${tr}`, values: [[hasWht ? 'TOTAL after withholding tax' : 'AMOUNT DUE']] });
  entered.push({ range: `F${tr}`, values: [[`=F${sub}+F${va}${minus.map((m) => `-${m}`).join('')}`]] });

  column('A', L.notesRow + 1, pad(d.notes, L.bankRow - L.notesRow - 1));
  column('A', L.bankRow + 1, pad(d.bankLines, bankCapacity(grid, L)));

  return { raw, entered };
}

const MONEY_PATTERN: Record<Currency, string> = { EUR: '"€"#,##0.00', JPY: '"¥"#,##0', USD: '"$"#,##0.00' };

export function planFormats(layout: Layout, d: InvoiceDraft, sheetId: number): Request[] {
  const L = need(layout);
  const money: sheets_v4.Schema$NumberFormat = { type: 'CURRENCY', pattern: MONEY_PATTERN[d.currency] };
  const percent: sheets_v4.Schema$NumberFormat = { type: 'PERCENT', pattern: '0.00%' };
  const fmt = (r0: number, r1: number, c0: number, c1: number, numberFormat: sheets_v4.Schema$NumberFormat): Request => ({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  const reqs = [fmt(L.descriptionRow + 1, L.subtotalRow, E, F + 1, money)];
  for (const r of [L.subtotalRow, L.irpfRow, L.vatAmountRow, L.whtAmountRow, L.totalRow]) {
    if (r != null) reqs.push(fmt(r, r + 1, F, F + 1, money));
  }
  for (const r of [L.vatRateRow, L.whtRateRow]) if (r != null) reqs.push(fmt(r, r + 1, F, F + 1, percent));
  return reqs;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function invoiceTitle(d: InvoiceDraft): string {
  const [y, m] = d.issueDate.split('-');
  return `Invoice ${d.clientLines[0]} - ${MONTHS[Number(m) - 1]} ${y} - ${d.number}`;
}
```

- [ ] **Step 4: Run the test to check it passes**

Run: `npx vitest run tests/writePlan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice/writePlan.ts tests/writePlan.test.ts
git commit -m "feat: pure write plan for filling the invoice template"
```

---

### Task 8: Auth, Google client, app shell

**Files:**
- Create: `src/auth.ts`, `src/types/next-auth.d.ts`, `src/lib/auth/allow.ts`, `src/lib/auth/refresh.ts`, `src/lib/google/client.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `.env.example`, `README.md`
- Modify: `src/app/layout.tsx` (replace), `src/app/page.tsx` (temporary)
- Test: `tests/allow.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedEmail(email: string | null | undefined, allowed: string | undefined): boolean`
  - `refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number; refreshToken?: string }>`
  - From `@/auth`: `auth`, `handlers`, `signIn`, `signOut`
  - `Google { drive: drive_v3.Drive; sheets: sheets_v4.Sheets; accessToken: string }`
  - `getGoogle(): Promise<Google>` (redirects to `/api/auth/signin` if there's no session)

- [ ] **Step 1: Write the failing test**

`tests/allow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from '@/lib/auth/allow';

describe('isAllowedEmail', () => {
  it('matches the allowlisted address case-insensitively', () => {
    expect(isAllowedEmail('Yann.Luc.Klein@gmail.com', 'yann.luc.klein@gmail.com')).toBe(true);
  });
  it('rejects others, empty values and a missing env var', () => {
    expect(isAllowedEmail('someone@gmail.com', 'yann.luc.klein@gmail.com')).toBe(false);
    expect(isAllowedEmail(undefined, 'yann.luc.klein@gmail.com')).toBe(false);
    expect(isAllowedEmail('yann.luc.klein@gmail.com', undefined)).toBe(false);
    expect(isAllowedEmail('', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/allow.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the auth modules**

`src/lib/auth/allow.ts`:

```ts
export function isAllowedEmail(email: string | null | undefined, allowed: string | undefined): boolean {
  if (!email || !allowed) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
```

`src/lib/auth/refresh.ts`:

```ts
export async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Token refresh failed (${res.status})`);
  return {
    accessToken: body.access_token as string,
    expiresAt: Math.floor(Date.now() / 1000) + (body.expires_in as number),
    refreshToken: body.refresh_token as string | undefined,
  };
}
```

`src/types/next-auth.d.ts`:

```ts
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
```

`src/auth.ts`:

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from '@/lib/auth/allow';
import { refreshGoogleToken } from '@/lib/auth/refresh';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { scope: SCOPES, access_type: 'offline', prompt: 'consent' } } })],
  callbacks: {
    signIn({ profile }) {
      return profile?.email_verified === true && isAllowedEmail(profile.email, process.env.ALLOWED_EMAIL);
    },
    async jwt({ token, account }) {
      if (account) {
        return { ...token, accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at, error: undefined };
      }
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) return token;
      if (!token.refreshToken) return { ...token, error: 'RefreshTokenError' };
      try {
        const t = await refreshGoogleToken(token.refreshToken);
        return { ...token, accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken ?? token.refreshToken, error: undefined };
      } catch {
        return { ...token, error: 'RefreshTokenError' };
      }
    },
    session({ session, token }) {
      // Single-user app: the token is only visible to its owner's own session.
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

`src/lib/google/client.ts`:

```ts
import { google, type drive_v3, type sheets_v4 } from 'googleapis';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export interface Google {
  drive: drive_v3.Drive;
  sheets: sheets_v4.Sheets;
  accessToken: string;
}

export async function getGoogle(): Promise<Google> {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/api/auth/signin');
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: session.accessToken });
  return {
    drive: google.drive({ version: 'v3', auth: oauth }),
    sheets: google.sheets({ version: 'v4', auth: oauth }),
    accessToken: session.accessToken,
  };
}
```

- [ ] **Step 4: Replace `src/app/layout.tsx` with the shell, and add a temporary home page**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import './globals.css';

export const metadata: Metadata = { title: 'Invoices', description: 'Yann Klein — invoices' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">Invoices</Link>
            <Link href="/invoices/new">New invoice</Link>
            <Link href="/settings">Settings</Link>
            {session?.user && (
              <form
                className="ml-auto"
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button className="text-muted-foreground hover:underline">Sign out {session.user.email}</button>
              </form>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

Temporary `src/app/page.tsx` (Task 10 replaces it):

```tsx
import { getGoogle } from '@/lib/google/client';

export default async function Home() {
  const g = await getGoogle();
  const about = await g.drive.about.get({ fields: 'user(emailAddress)' });
  return <p>Drive connected as {about.data.user?.emailAddress}</p>;
}
```

- [ ] **Step 5: Write `.env.example` and `README.md`**

`.env.example`:

```
# npx auth secret
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_EMAIL=yann.luc.klein@gmail.com
AUTH_TRUST_HOST=true
```

`README.md`:

````markdown
# yann-invoice

Private invoice generator. Invoices are Google Sheets in the Drive folder `Invoices`;
`Invoice Index` in that folder is a cache the app rebuilds from them.

## Google Cloud setup (once)

1. console.cloud.google.com → new project "yann-invoice".
2. APIs & Services → Library → enable **Google Drive API** and **Google Sheets API**.
3. OAuth consent screen → External, app name "yann-invoice", add scopes `.../auth/drive` and `.../auth/spreadsheets`.
   **Publish the app ("In production")**. It stays unverified, which is fine for your own account.
   ("Testing" mode expires refresh tokens after 7 days.)
4. Credentials → Create OAuth client ID → Web application. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://invoice.yannklein.dev/api/auth/callback/google`
5. Copy the client ID and secret into `.env.local` (see `.env.example`). Generate `AUTH_SECRET` with `npx auth secret`.

Use the **same OAuth client** everywhere. The app finds its Drive folder, index and template through
`appProperties`, which are private to the OAuth client that wrote them.

## Develop

```bash
npm install
npm run dev    # http://localhost:3000
npm test
```

## First run

Sign in → Settings → review the list of legacy invoices → **Run setup**. This creates `Invoices`,
moves every `Invoice …` sheet into it (links keep working), creates `Invoice Template` (a copy of
202609003) and `Invoice Index`, then indexes everything (about 1 minute).

To change your sender details (address, Tax ID), edit `Invoice Template` in Google Sheets.
````

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/allow.test.ts` → PASS. Run: `npm run build` → succeeds.

Manual check (needs Yann's OAuth credentials in `.env.local`; ask him if they're missing):
- `npm run dev` → open http://localhost:3000. You should be sent to Google sign-in. Signing in as yann.luc.klein@gmail.com shows "Drive connected as yann.luc.klein@gmail.com".
- Signing in with any other Google account ends on the Auth.js "AccessDenied" page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Google sign-in restricted to one account, Drive/Sheets client"
```

---

### Task 9: Drive helpers, index store, sync, setup and settings page

**Files:**
- Create: `src/lib/google/drive.ts`, `src/lib/index/store.ts`, `src/lib/setup.ts`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`
- Test: `tests/setup.test.ts` (pure part only)

**Interfaces:**
- Consumes: `Google`, `getGoogle`, `parseInvoice`, `normalizeGrid`, `Grid`, `IndexRow`, `sortNewest`, everything in `rows.ts`, `Settings`
- Produces:
  - `drive.ts`:
    - `ROLE_KEY = 'yannInvoiceRole'`, `SHEET_MIME`, `Role = 'folder' | 'index' | 'template' | 'invoice'`
    - `AppIds { folderId; indexId; templateId }`
    - `findByRole(drive, role): Promise<string | null>`
    - `resolveIds(drive): Promise<AppIds | null>`, `clearIdsCache(): void`, `requireIds(g: Google): Promise<AppIds>` (redirects to `/settings`)
    - `listAll(drive, q, fields): Promise<drive_v3.Schema$File[]>`
    - `listInvoiceFiles(drive, folderId): Promise<DriveInvoiceFile[]>`
    - `readGrid(sheets, spreadsheetId): Promise<Grid>`
  - `store.ts`:
    - `readIndex(sheets, indexId): Promise<IndexRow[]>`, `writeIndex(sheets, indexId, rows): Promise<void>`
    - `readSettings(sheets, indexId): Promise<Settings>`, `writeSettings(sheets, indexId, s): Promise<void>`
    - `syncIndex(g, ids, opts?: { full?: boolean }): Promise<IndexRow[]>`
  - `setup.ts`:
    - `TEMPLATE_SOURCE_ID`, `isLegacyInvoiceName(name): boolean`
    - `previewSetup(g): Promise<{ id: string; name: string; parents: string[] }[]>`
    - `runSetup(g): Promise<AppIds>`

- [ ] **Step 1: Write the failing test** (pure filter)

`tests/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isLegacyInvoiceName } from '@/lib/setup';

describe('isLegacyInvoiceName', () => {
  it('matches the historical naming only', () => {
    expect(isLegacyInvoiceName('Invoice GALILEO GLOBAL - Sep 2026 - 202609005')).toBe(true);
    expect(isLegacyInvoiceName('Invoice Looking Glass  - Week #27-28')).toBe(true);
    expect(isLegacyInvoiceName('Invoices summary')).toBe(false);
    expect(isLegacyInvoiceName('Old Invoice X')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/google/drive.ts`**

```ts
import type { drive_v3, sheets_v4 } from 'googleapis';
import { redirect } from 'next/navigation';
import { normalizeGrid, type Grid } from '@/lib/invoice/cells';
import type { DriveInvoiceFile } from '@/lib/index/rows';
import type { Google } from './client';

export const ROLE_KEY = 'yannInvoiceRole';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export type Role = 'folder' | 'index' | 'template' | 'invoice';

export interface AppIds {
  folderId: string;
  indexId: string;
  templateId: string;
}

export async function listAll(drive: drive_v3.Drive, q: string, fields: string): Promise<drive_v3.Schema$File[]> {
  const out: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({ q, fields: `nextPageToken, files(${fields})`, pageSize: 200, pageToken, spaces: 'drive' });
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function findByRole(drive: drive_v3.Drive, role: Role): Promise<string | null> {
  const files = await listAll(drive, `appProperties has { key='${ROLE_KEY}' and value='${role}' } and trashed=false`, 'id');
  return files[0]?.id ?? null;
}

let cache: AppIds | null = null;
export function clearIdsCache() {
  cache = null;
}

export async function resolveIds(drive: drive_v3.Drive): Promise<AppIds | null> {
  if (cache) return cache;
  const [folderId, indexId, templateId] = await Promise.all(
    (['folder', 'index', 'template'] as const).map((r) => findByRole(drive, r)),
  );
  if (!folderId || !indexId || !templateId) return null;
  return (cache = { folderId, indexId, templateId });
}

export async function requireIds(g: Google): Promise<AppIds> {
  const ids = await resolveIds(g.drive);
  if (!ids) redirect('/settings');
  return ids;
}

export async function listInvoiceFiles(drive: drive_v3.Drive, folderId: string): Promise<DriveInvoiceFile[]> {
  const files = await listAll(
    drive,
    `'${folderId}' in parents and mimeType='${SHEET_MIME}' and trashed=false`,
    'id,name,modifiedTime,appProperties',
  );
  return files
    .filter((f) => !['index', 'template'].includes(f.appProperties?.[ROLE_KEY] ?? ''))
    .map((f) => ({ id: f.id!, name: f.name!, modifiedTime: f.modifiedTime!, appProperties: f.appProperties ?? {} }));
}

export async function readGrid(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<Grid> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A1:F80', valueRenderOption: 'FORMATTED_VALUE' });
  return normalizeGrid(res.data.values);
}
```

- [ ] **Step 4: Implement `src/lib/index/store.ts`**

```ts
import type { sheets_v4 } from 'googleapis';
import { listInvoiceFiles, readGrid, type AppIds } from '@/lib/google/drive';
import type { Google } from '@/lib/google/client';
import { sortNewest, type IndexRow } from '@/lib/invoice/derive';
import { parseInvoice } from '@/lib/invoice/parse';
import type { Settings } from '@/lib/invoice/types';
import { diffFiles, metaFromAppProperties, rowToValues, settingsFromValues, settingsToValues, valuesToRow } from './rows';

const INVOICES_RANGE = 'Invoices!A2:J';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readIndex(sheets: sheets_v4.Sheets, indexId: string): Promise<IndexRow[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: indexId, range: INVOICES_RANGE });
  return (res.data.values ?? []).map(valuesToRow).filter((r): r is IndexRow => r !== null);
}

export async function writeIndex(sheets: sheets_v4.Sheets, indexId: string, rows: IndexRow[]): Promise<void> {
  await sheets.spreadsheets.values.clear({ spreadsheetId: indexId, range: INVOICES_RANGE });
  if (!rows.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: indexId,
    range: 'Invoices!A2',
    valueInputOption: 'RAW',
    requestBody: { values: rows.map(rowToValues) },
  });
}

export async function readSettings(sheets: sheets_v4.Sheets, indexId: string): Promise<Settings> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: indexId, range: 'Settings!A2:B' });
  return settingsFromValues(res.data.values ?? []);
}

export async function writeSettings(sheets: sheets_v4.Sheets, indexId: string, s: Settings): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId: indexId,
    range: 'Settings!A2:B3',
    valueInputOption: 'RAW',
    requestBody: { values: settingsToValues(s) },
  });
}

/** Re-parse only new or modified invoice sheets. Full mode rebuilds the whole index. */
export async function syncIndex(g: Google, ids: AppIds, opts: { full?: boolean } = {}): Promise<IndexRow[]> {
  const [files, existing] = await Promise.all([
    listInvoiceFiles(g.drive, ids.folderId),
    opts.full ? Promise.resolve([] as IndexRow[]) : readIndex(g.sheets, ids.indexId),
  ]);
  const { toParse, kept, changed } = diffFiles(files, existing, !!opts.full);
  if (!changed) return sortNewest(existing);

  const throttle = toParse.length > 40; // stay under 60 Sheets reads/min/user
  const parsed: IndexRow[] = [];
  for (const f of toParse) {
    try {
      const grid = await readGrid(g.sheets, f.id);
      parsed.push({ fileId: f.id, title: f.name, modifiedTime: f.modifiedTime, meta: metaFromAppProperties(f.appProperties), invoice: parseInvoice(grid, f.name) });
    } catch (e) {
      console.error(`[sync] could not read ${f.name} (${f.id})`, e);
    }
    if (throttle) await sleep(1100);
  }
  const rows = sortNewest([...kept, ...parsed]);
  await writeIndex(g.sheets, ids.indexId, rows);
  return rows;
}
```

- [ ] **Step 5: Implement `src/lib/setup.ts`**

```ts
import type { Google } from '@/lib/google/client';
import { FOLDER_MIME, ROLE_KEY, SHEET_MIME, clearIdsCache, findByRole, listAll, type AppIds } from '@/lib/google/drive';
import { INDEX_HEADER, settingsToValues } from '@/lib/index/rows';
import { syncIndex } from '@/lib/index/store';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

/** "Invoice Le Wagon Spain - 202609003": current sender block, IRPF row — the template source. */
export const TEMPLATE_SOURCE_ID = '1WHSl3CWOMQo8RIu3SIkKnCXzl9O84_lLsPqSGHWOrI8';

export const isLegacyInvoiceName = (name: string) => /^Invoice\s/.test(name);

export async function previewSetup(g: Google): Promise<{ id: string; name: string; parents: string[] }[]> {
  const folderId = await findByRole(g.drive, 'folder');
  const files = await listAll(
    g.drive,
    `mimeType='${SHEET_MIME}' and 'me' in owners and trashed=false and name contains 'Invoice'`,
    'id,name,parents,appProperties',
  );
  return files
    .filter((f) => isLegacyInvoiceName(f.name ?? '') && !f.appProperties?.[ROLE_KEY] && !(folderId && f.parents?.includes(folderId)))
    .map((f) => ({ id: f.id!, name: f.name!, parents: f.parents ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function moveInto(g: Google, fileId: string, folderId: string) {
  const { data } = await g.drive.files.get({ fileId, fields: 'parents' });
  await g.drive.files.update({ fileId, addParents: folderId, removeParents: (data.parents ?? []).join(','), fields: 'id' });
}

/** Idempotent: re-running only does the missing steps. */
export async function runSetup(g: Google): Promise<AppIds> {
  const folderId =
    (await findByRole(g.drive, 'folder')) ??
    (await g.drive.files.create({ fields: 'id', requestBody: { name: 'Invoices', mimeType: FOLDER_MIME, appProperties: { [ROLE_KEY]: 'folder' } } })).data.id!;

  for (const f of await previewSetup(g)) await moveInto(g, f.id, folderId);

  const templateId =
    (await findByRole(g.drive, 'template')) ??
    (await g.drive.files.copy({
      fileId: TEMPLATE_SOURCE_ID,
      fields: 'id',
      requestBody: { name: 'Invoice Template', parents: [folderId], appProperties: { [ROLE_KEY]: 'template' } },
    })).data.id!;

  let indexId = await findByRole(g.drive, 'index');
  if (!indexId) {
    const created = await g.sheets.spreadsheets.create({
      requestBody: { properties: { title: 'Invoice Index' }, sheets: [{ properties: { title: 'Invoices' } }, { properties: { title: 'Settings' } }] },
    });
    indexId = created.data.spreadsheetId!;
    await g.drive.files.update({ fileId: indexId, requestBody: { appProperties: { [ROLE_KEY]: 'index' } } });
    await moveInto(g, indexId, folderId);
    await g.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: indexId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Invoices!A1:J1', values: [INDEX_HEADER] },
          { range: 'Settings!A1:B3', values: [['key', 'value'], ...settingsToValues(DEFAULT_SETTINGS)] },
        ],
      },
    });
  }

  clearIdsCache();
  const ids = { folderId, indexId, templateId };
  await syncIndex(g, ids, { full: true });
  return ids;
}
```

- [ ] **Step 6: Settings page and actions**

`src/app/settings/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex, writeSettings } from '@/lib/index/store';
import { runSetup } from '@/lib/setup';

export async function runSetupAction() {
  const g = await getGoogle();
  await runSetup(g);
  revalidatePath('/');
  redirect('/');
}

export async function saveSettingsAction(formData: FormData) {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const irpfPercent = Number(formData.get('irpfPercent'));
  const defaultTerms = String(formData.get('defaultTerms') ?? '').trim();
  if (!Number.isFinite(irpfPercent) || irpfPercent < 0 || irpfPercent > 50 || !defaultTerms) return;
  await writeSettings(g.sheets, ids.indexId, { irpfRate: Math.round(irpfPercent * 1e4) / 1e6, defaultTerms });
  revalidatePath('/settings');
}

export async function fullResyncAction() {
  const g = await getGoogle();
  await syncIndex(g, await requireIds(g), { full: true });
  revalidatePath('/');
  redirect('/');
}
```

`src/app/settings/page.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getGoogle } from '@/lib/google/client';
import { resolveIds } from '@/lib/google/drive';
import { readSettings } from '@/lib/index/store';
import { previewSetup } from '@/lib/setup';
import { fullResyncAction, runSetupAction, saveSettingsAction } from './actions';

export default async function SettingsPage() {
  const g = await getGoogle();
  const ids = await resolveIds(g.drive);

  if (!ids) {
    const toMove = await previewSetup(g);
    return (
      <Card>
        <CardHeader><CardTitle>First-time setup</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            This creates a Drive folder <b>Invoices</b>, moves the {toMove.length} sheets below into it (their links keep working),
            and creates <b>Invoice Template</b> and <b>Invoice Index</b>. Indexing takes about a minute.
          </p>
          <ul className="max-h-80 list-disc overflow-auto pl-6">{toMove.map((f) => <li key={f.id}>{f.name}</li>)}</ul>
          <form action={runSetupAction}><Button type="submit">Run setup</Button></form>
        </CardContent>
      </Card>
    );
  }

  const settings = await readSettings(g.sheets, ids.indexId);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent>
          <form action={saveSettingsAction} className="grid max-w-sm gap-3">
            <Label htmlFor="irpfPercent">IRPF rate (%)</Label>
            <Input id="irpfPercent" name="irpfPercent" type="number" step="0.01" defaultValue={+(settings.irpfRate * 100).toFixed(2)} />
            <Label htmlFor="defaultTerms">Default terms (new clients)</Label>
            <Input id="defaultTerms" name="defaultTerms" defaultValue={settings.defaultTerms} />
            <Button type="submit" className="w-fit">Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Drive</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex gap-4">
            <a className="underline" href={`https://drive.google.com/drive/folders/${ids.folderId}`} target="_blank">Invoices folder ↗</a>
            <a className="underline" href={`https://docs.google.com/spreadsheets/d/${ids.templateId}/edit`} target="_blank">Template ↗</a>
            <a className="underline" href={`https://docs.google.com/spreadsheets/d/${ids.indexId}/edit`} target="_blank">Index ↗</a>
          </p>
          <p>To change your sender details, edit the template in Sheets.</p>
          <form action={fullResyncAction}><Button variant="outline" type="submit">Full resync (≈1 min)</Button></form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run` → all PASS. Run: `npm run build` → succeeds.

Manual check against the real Drive. **Ask Yann before pressing "Run setup":** it moves his files.
1. `npm run dev` → `/settings` lists about 55 `Invoice …` sheets and nothing else.
2. Press **Run setup**. In Drive, the folder `Invoices` now holds every invoice, plus `Invoice Template` and `Invoice Index`.
3. Open `Invoice Index`. The `Invoices` tab has one row per invoice (spot-check that 202606004 shows total 404055), and the `Settings` tab has `irpfRate 0.07`.
4. Reload `/settings`. It now shows the settings form. Change the IRPF rate to 7 and save; the Index `Settings` tab still reads 0.07.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: one-time Drive setup, invoice index sync, settings page"
```

---

### Task 10: Invoice list, detail page, PDF download

**Files:**
- Create: `src/lib/invoice/pdf.ts`, `src/app/invoices/[id]/page.tsx`, `src/app/api/invoices/[id]/pdf/route.ts`
- Modify: `src/app/page.tsx` (replace the temporary page)
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Consumes: `getGoogle`, `requireIds`, `syncIndex`, `readIndex`, `IndexRow`, `formatMoney`
- Produces:
  - `pdfExportUrl(fileId: string): string`
  - `pdfFileName(row: IndexRow): string`
  - `contentDisposition(name: string): string`
  - `sheetUrl(fileId: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { contentDisposition, pdfExportUrl, pdfFileName } from '@/lib/invoice/pdf';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, JP_STEAMPUNK_2021 } from './fixtures/grids';

const row = (grid: string[][], title: string) => ({ fileId: 'f', title, modifiedTime: 'm', meta: {}, invoice: parseInvoice(grid, title) });

describe('pdf helpers', () => {
  it('builds an A4 portrait fit-to-width export URL', () => {
    const url = new URL(pdfExportUrl('abc'));
    expect(url.pathname).toBe('/spreadsheets/d/abc/export');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ format: 'pdf', size: 'A4', portrait: 'true', fitw: 'true', gridlines: 'false' });
  });
  it('names the file by number and client, falling back to the title, without path characters', () => {
    expect(pdfFileName(row(ES_202609003, 'Invoice Le Wagon Spain - 202609003'))).toBe('Invoice 202609003 - LE WAGON SPAIN, S.L.pdf');
    expect(pdfFileName(row(JP_STEAMPUNK_2021, 'Invoice Steampunk Digital - CoffeeCam/iPhone'))).toBe('Invoice Steampunk Digital - CoffeeCam-iPhone.pdf');
  });
  it('encodes non-ASCII names for the download header', () => {
    expect(contentDisposition('Invoice 株式会社.pdf')).toBe(`attachment; filename="Invoice ____.pdf"; filename*=UTF-8''Invoice%20%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE.pdf`);
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/invoice/pdf.ts`**

```ts
import type { IndexRow } from './derive';

export const sheetUrl = (fileId: string) => `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

export function pdfExportUrl(fileId: string): string {
  const params = new URLSearchParams({
    format: 'pdf', size: 'A4', portrait: 'true', fitw: 'true', gridlines: 'false',
    printtitle: 'false', sheetnames: 'false', pagenum: 'UNDEFINED',
  });
  return `https://docs.google.com/spreadsheets/d/${fileId}/export?${params}`;
}

export function pdfFileName(row: IndexRow): string {
  const { number, clientName } = row.invoice;
  const base = number ? `Invoice ${number} - ${clientName}` : row.title;
  return `${base.replace(/[/\\:*?"<>|]/g, '-')}.pdf`;
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
```

- [ ] **Step 4: PDF route** `src/app/api/invoices/[id]/pdf/route.ts`

```ts
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readIndex } from '@/lib/index/store';
import { contentDisposition, pdfExportUrl, pdfFileName } from '@/lib/invoice/pdf';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGoogle();
  const ids = await requireIds(g);
  const row = (await readIndex(g.sheets, ids.indexId)).find((r) => r.fileId === id);
  if (!row) return new Response('Not found', { status: 404 }); // only indexed invoices can be exported
  const res = await fetch(pdfExportUrl(id), { headers: { Authorization: `Bearer ${g.accessToken}` } });
  if (!res.ok || !res.body) return new Response(`PDF export failed (${res.status})`, { status: 502 });
  return new Response(res.body, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(pdfFileName(row)) },
  });
}
```

- [ ] **Step 5: List page** — replace `src/app/page.tsx`

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney } from '@/lib/invoice/totals';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const g = await getGoogle();
  const rows = await syncIndex(g, await requireIds(g));
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.invoice.number, r.invoice.clientName, r.title].some((s) => s?.toLowerCase().includes(needle)))
    : rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <form className="flex flex-1 gap-2">
          <Input name="q" defaultValue={q} placeholder="Search number or client" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Button asChild variant="outline"><Link href="/">Sync</Link></Button>
        <Button asChild><Link href="/invoices/new">New invoice</Link></Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Number</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.fileId}>
              <TableCell><Link className="underline" href={`/invoices/${r.fileId}`}>{r.invoice.number ?? '—'}</Link></TableCell>
              <TableCell>{r.invoice.clientName}</TableCell>
              <TableCell>{r.invoice.issueDate ?? '—'}</TableCell>
              <TableCell className="text-right">{r.invoice.total == null ? '—' : formatMoney(r.invoice.total, r.invoice.currency)}</TableCell>
              <TableCell className="space-x-3 text-right whitespace-nowrap">
                <a className="underline" href={sheetUrl(r.fileId)} target="_blank">Sheet ↗</a>
                <a className="underline" href={`/api/invoices/${r.fileId}/pdf`}>PDF ⬇</a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!shown.length && <p className="text-sm text-muted-foreground">No invoices match.</p>}
    </div>
  );
}
```

- [ ] **Step 6: Detail page** `src/app/invoices/[id]/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readIndex } from '@/lib/index/store';
import { COUNTRIES } from '@/lib/invoice/countries';
import { effectiveCountry } from '@/lib/invoice/derive';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney, roundMoney } from '@/lib/invoice/totals';

const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGoogle();
  const ids = await requireIds(g);
  const row = (await readIndex(g.sheets, ids.indexId)).find((r) => r.fileId === id);
  if (!row) notFound();
  const inv = row.invoice;
  const money = (n: number | null) => (n == null ? '—' : formatMoney(n, inv.currency));
  const country = effectiveCountry(row);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold">Invoice {inv.number ?? row.title}</h1>
        <Button asChild variant="outline"><a href={sheetUrl(id)} target="_blank">Open in Sheets ↗</a></Button>
        <Button asChild><a href={`/api/invoices/${id}/pdf`}>Download PDF</a></Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Client</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {inv.clientLines.map((l, i) => <div key={i}>{l}</div>)}
            <div className="mt-2 text-muted-foreground">{COUNTRIES[country] ?? country}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Issue date: {inv.issueDate ?? '—'}</div>
            <div>Terms: {inv.terms ?? '—'}</div>
            <div>Currency: {inv.currency}</div>
          </CardContent>
        </Card>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>
          {inv.items.map((it, i) => (
            <TableRow key={i}>
              <TableCell className="whitespace-normal">{it.description}</TableCell>
              <TableCell className="text-right">{it.quantity}</TableCell>
              <TableCell className="text-right">{money(it.unitPrice)}</TableCell>
              <TableCell className="text-right">{money(it.quantity * it.unitPrice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="ml-auto w-72 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
        {inv.irpfRate > 0 && inv.subtotal != null && (
          <div className="flex justify-between"><span>IRPF ({pct(inv.irpfRate)})</span><span>−{money(roundMoney(inv.subtotal * inv.irpfRate, inv.currency))}</span></div>
        )}
        <div className="flex justify-between"><span>VAT rate</span><span>{pct(inv.vatRate)}</span></div>
        {inv.withholdingRate > 0 && <div className="flex justify-between"><span>Withholding</span><span>{pct(inv.withholdingRate)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Total</span><span>{money(inv.total)}</span></div>
      </div>
      <Card>
        <CardHeader><CardTitle>Notes &amp; bank</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>{inv.notes.map((n, i) => <div key={i}>{n}</div>)}</div>
          <div className="text-muted-foreground">{inv.bankLines.map((l, i) => <div key={i}>{l}</div>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds.

Manual check:
1. `/` lists every invoice, newest first, and searching "matinno" filters the list.
2. Open 202606004: the client, the item, a total of ¥404,055, 10.21% withholding and the 7 SMBC lines are all shown.
3. **Download PDF** saves "Invoice 202606004 - New Normdesign. Inc.pdf", and it looks like the sheet on one A4 page.
4. Change a cell in that sheet in Google Sheets (for example the terms), click **Sync**, open the detail page, and check the change is there. Undo the edit afterwards.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: invoice list, detail page and PDF download"
```

---

### Task 11: Create invoices (sheet writer, form, server action)

**Files:**
- Create: `src/lib/google/writeInvoice.ts`, `src/lib/invoice/schema.ts`, `src/app/invoices/new/page.tsx`, `src/app/invoices/new/NewInvoiceForm.tsx`, `src/app/invoices/new/actions.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: `planStructure`, `planValues`, `planFormats`, `invoiceTitle`, `locate`, `readGrid`, `ROLE_KEY`, `AppIds`, `taxRulesFor`, `computeTotals`, `formatMoney`, `nextNumber`, `isDuplicate`, `deriveClients`, `deriveBanks`, `syncIndex`, `readSettings`, `COUNTRIES`, `CURRENCIES`
- Produces:
  - `splitLines(s: string): string[]`
  - `draftSchema` (zod), `DraftForm`
  - `toDraft(f: DraftForm, settings: Settings): InvoiceDraft`
  - `createInvoiceSheet(g: Google, ids: AppIds, d: InvoiceDraft): Promise<string>` (returns the new file id; trashes the copy if any write fails)
  - `createInvoiceAction(form: DraftForm): Promise<{ error: string } | undefined>` (redirects on success)

- [ ] **Step 1: Write the failing test**

`tests/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { draftSchema, splitLines, toDraft, type DraftForm } from '@/lib/invoice/schema';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

const form = (patch: Partial<DraftForm> = {}): DraftForm => ({
  number: ' 202610001 ', issueDate: '2026-10-04', terms: 'Due upon receipt',
  clientLinesText: 'New Normdesign. Inc\n〒103-0027\n\n Tokyo , Nihonbashi, 3-1-3 ', country: 'JP', serviceType: 'other',
  currency: 'JPY', withholdingPercent: 10.21,
  items: [{ description: 'Development', quantity: 1, unitPrice: 450000 }],
  notesText: 'Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA\n- extra note', bankLinesText: '• line 1\n• line 2',
  ...patch,
});

describe('splitLines', () => {
  it('trims and drops empty lines', () => {
    expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });
});

describe('draftSchema', () => {
  it('accepts a valid form', () => {
    expect(draftSchema.safeParse(form()).success).toBe(true);
  });
  it('rejects missing country, empty client, 9 items, no bank', () => {
    expect(draftSchema.safeParse(form({ country: '' })).success).toBe(false);
    expect(draftSchema.safeParse(form({ clientLinesText: ' \n ' })).success).toBe(false);
    expect(draftSchema.safeParse(form({ items: Array(9).fill({ description: 'x', quantity: 1, unitPrice: 1 }) })).success).toBe(false);
    expect(draftSchema.safeParse(form({ bankLinesText: '' })).success).toBe(false);
  });
});

describe('toDraft', () => {
  it('applies tax rules, keeps edited notes, cleans lines and rates', () => {
    const d = toDraft(form(), DEFAULT_SETTINGS);
    expect(d).toMatchObject({
      number: '202610001', country: 'JP', serviceType: 'other', currency: 'JPY',
      clientLines: ['New Normdesign. Inc', '〒103-0027', 'Tokyo , Nihonbashi, 3-1-3'],
      vatRate: 0, irpfRate: 0, withholdingRate: 0.1021,
      notes: ['Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA', '- extra note'],
      bankLines: ['• line 1', '• line 2'],
    });
  });
  it('Spain + other gets 21% IVA and IRPF from settings', () => {
    const d = toDraft(form({ country: 'ES', serviceType: 'other', withholdingPercent: 0, currency: 'EUR' }), { ...DEFAULT_SETTINGS, irpfRate: 0.15 });
    expect(d).toMatchObject({ vatRate: 0.21, irpfRate: 0.15, withholdingRate: 0 });
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/invoice/schema.ts`**

```ts
import { z } from 'zod';
import { taxRulesFor } from './taxRules';
import type { InvoiceDraft, Settings } from './types';

export const splitLines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

export const draftSchema = z.object({
  number: z.string().trim().min(1, 'Required'),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  terms: z.string().trim().min(1, 'Required'),
  clientLinesText: z.string().refine((s) => splitLines(s).length > 0, 'At least the client name'),
  country: z.string().regex(/^[A-Z]{2}$/, 'Pick a country'),
  serviceType: z.enum(['teaching', 'other']),
  currency: z.enum(['EUR', 'JPY', 'USD']),
  withholdingPercent: z.number().min(0).max(50),
  items: z
    .array(z.object({ description: z.string().trim().min(1, 'Required'), quantity: z.number().positive(), unitPrice: z.number().min(0) }))
    .min(1)
    .max(8),
  notesText: z.string(),
  bankLinesText: z.string().refine((s) => splitLines(s).length > 0, 'Bank details required'),
});

export type DraftForm = z.infer<typeof draftSchema>;

export function toDraft(f: DraftForm, settings: Settings): InvoiceDraft {
  const clientLines = splitLines(f.clientLinesText);
  const withholdingRate = Math.round(f.withholdingPercent * 1e4) / 1e6;
  const tax = taxRulesFor({ country: f.country, serviceType: f.serviceType, withholdingRate, clientLines }, settings);
  return {
    number: f.number.trim(),
    issueDate: f.issueDate,
    terms: f.terms.trim(),
    clientLines,
    country: f.country,
    serviceType: f.serviceType,
    currency: f.currency,
    items: f.items.map((i) => ({ ...i, description: i.description.trim() })),
    vatRate: tax.vatRate,
    irpfRate: tax.irpfRate,
    withholdingRate: tax.withholdingRate,
    notes: splitLines(f.notesText),
    bankLines: splitLines(f.bankLinesText),
  };
}
```

- [ ] **Step 4: Run the test to check it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/lib/google/writeInvoice.ts`**

```ts
import { locate } from '@/lib/invoice/layout';
import type { InvoiceDraft } from '@/lib/invoice/types';
import { invoiceTitle, planFormats, planStructure, planValues, type ValueRange } from '@/lib/invoice/writePlan';
import type { Google } from './client';
import { ROLE_KEY, readGrid, type AppIds } from './drive';

/** Copy the template, reshape rows, fill values, format money. Trashes the copy if anything fails. */
export async function createInvoiceSheet(g: Google, ids: AppIds, d: InvoiceDraft): Promise<string> {
  const copy = await g.drive.files.copy({
    fileId: ids.templateId,
    fields: 'id',
    requestBody: {
      name: invoiceTitle(d),
      parents: [ids.folderId],
      appProperties: { [ROLE_KEY]: 'invoice', country: d.country, serviceType: d.serviceType },
    },
  });
  const id = copy.data.id!;
  try {
    const meta = await g.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(sheetId,title)' });
    const { sheetId, title } = meta.data.sheets![0].properties!;
    const at = (v: ValueRange) => ({ ...v, range: `'${title!.replace(/'/g, "''")}'!${v.range}` });

    let grid = await readGrid(g.sheets, id);
    const structure = planStructure(locate(grid), grid, d, sheetId!);
    if (structure.length) {
      await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: structure } });
      grid = await readGrid(g.sheets, id);
    }
    const layout = locate(grid);
    const { raw, entered } = planValues(layout, grid, d);
    await g.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'RAW', data: raw.map(at) } });
    await g.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'USER_ENTERED', data: entered.map(at) } });
    await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: planFormats(layout, d, sheetId!) } });
    return id;
  } catch (e) {
    await g.drive.files.update({ fileId: id, requestBody: { trashed: true } }).catch(() => undefined);
    throw e;
  }
}
```

- [ ] **Step 6: Server action** `src/app/invoices/new/actions.ts`

```ts
'use server';

import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { createInvoiceSheet } from '@/lib/google/writeInvoice';
import { readSettings, syncIndex } from '@/lib/index/store';
import { draftSchema, toDraft, type DraftForm } from '@/lib/invoice/schema';

export async function createInvoiceAction(form: DraftForm): Promise<{ error: string } | undefined> {
  const parsed = draftSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };

  const g = await getGoogle();
  const ids = await requireIds(g);
  let id: string;
  try {
    const settings = await readSettings(g.sheets, ids.indexId);
    id = await createInvoiceSheet(g, ids, toDraft(parsed.data, settings));
    await syncIndex(g, ids);
  } catch (e) {
    return { error: `Could not create the invoice: ${e instanceof Error ? e.message : String(e)}` };
  }
  redirect(`/invoices/${id}`);
}
```

- [ ] **Step 7: Page** `src/app/invoices/new/page.tsx`

```tsx
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readSettings, syncIndex } from '@/lib/index/store';
import { deriveBanks, deriveClients } from '@/lib/invoice/derive';
import { NewInvoiceForm } from './NewInvoiceForm';

export default async function NewInvoicePage() {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const [rows, settings] = await Promise.all([syncIndex(g, ids), readSettings(g.sheets, ids.indexId)]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return (
    <NewInvoiceForm
      clients={deriveClients(rows)}
      banks={deriveBanks(rows)}
      numbers={rows.map((r) => r.invoice.number)}
      settings={settings}
      today={today}
    />
  );
}
```

- [ ] **Step 8: Form** `src/app/invoices/new/NewInvoiceForm.tsx`

```tsx
'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRIES } from '@/lib/invoice/countries';
import type { BankAccount, ClientProfile } from '@/lib/invoice/derive';
import { isDuplicate, nextNumber } from '@/lib/invoice/numbering';
import { draftSchema, splitLines, type DraftForm } from '@/lib/invoice/schema';
import { taxRulesFor } from '@/lib/invoice/taxRules';
import { computeTotals, formatMoney } from '@/lib/invoice/totals';
import { CURRENCIES, type Settings } from '@/lib/invoice/types';
import { createInvoiceAction } from './actions';

interface Props {
  clients: ClientProfile[];
  banks: BankAccount[];
  numbers: (string | null)[];
  settings: Settings;
  today: string;
}

const NEW = '__new__';
const selectCls = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

export function NewInvoiceForm({ clients, banks, numbers, settings, today }: Props) {
  const [clientKey, setClientKey] = useState(NEW);
  const [bankKey, setBankKey] = useState(banks[0]?.key ?? NEW);
  const [numberEdited, setNumberEdited] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<DraftForm>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      number: nextNumber(numbers, today), issueDate: today, terms: settings.defaultTerms,
      clientLinesText: '', country: '', serviceType: 'teaching', currency: 'EUR', withholdingPercent: 0,
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
      notesText: '', bankLinesText: banks[0]?.lines.join('\n') ?? '',
    },
  });
  const items = useFieldArray({ control, name: 'items' });
  const w = useWatch({ control });

  const tax = useMemo(
    () => taxRulesFor({
      country: w.country || 'unknown',
      serviceType: w.serviceType ?? 'teaching',
      withholdingRate: (Number(w.withholdingPercent) || 0) / 100,
      clientLines: splitLines(w.clientLinesText ?? ''),
    }, settings),
    [w.country, w.serviceType, w.withholdingPercent, w.clientLinesText, settings],
  );

  // Notes follow the tax rule; any edits are kept until the rule changes.
  const ruleNotes = tax.notes.join('\n');
  useEffect(() => setValue('notesText', ruleNotes), [ruleNotes, setValue]);

  // The number follows the issue month until it is edited by hand.
  useEffect(() => {
    if (!numberEdited && /^\d{4}-\d{2}-\d{2}$/.test(w.issueDate ?? '')) setValue('number', nextNumber(numbers, w.issueDate!));
  }, [w.issueDate, numberEdited, numbers, setValue]);

  const currency = w.currency ?? 'EUR';
  const totals = computeTotals(
    (w.items ?? []).map((i) => ({ description: '', quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0 })),
    tax,
    currency,
  );
  const duplicate = isDuplicate(numbers, w.number ?? '');

  function pickBank(key: string) {
    setBankKey(key);
    setValue('bankLinesText', banks.find((b) => b.key === key)?.lines.join('\n') ?? '');
  }

  function pickClient(key: string) {
    setClientKey(key);
    const c = clients.find((x) => x.key === key);
    if (!c) {
      setValue('clientLinesText', '');
      setValue('country', '');
      setValue('withholdingPercent', 0);
      return;
    }
    setValue('clientLinesText', c.lines.join('\n'));
    setValue('country', c.country === 'unknown' ? '' : c.country);
    setValue('currency', c.currency);
    setValue('terms', c.terms || settings.defaultTerms);
    setValue('serviceType', c.serviceType);
    setValue('withholdingPercent', +(c.withholdingRate * 100).toFixed(4));
    const bank = banks.find((b) => b.key === c.bankLines.join('\n'));
    if (bank) pickBank(bank.key);
  }

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setServerError(null);
      const res = await createInvoiceAction(values);
      if (res?.error) setServerError(res.error);
    }),
  );

  const err = (msg?: string) => (msg ? <p className="text-xs text-red-600">{msg}</p> : null);

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <h1 className="text-xl font-semibold">New invoice</h1>

      <section className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="number">Number</Label>
          <Input id="number" {...register('number', { onChange: () => setNumberEdited(true) })} />
          {duplicate && <p className="text-xs text-amber-600">This number is already used.</p>}
          {err(errors.number?.message)}
        </div>
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" type="date" {...register('issueDate')} />
          {err(errors.issueDate?.message)}
        </div>
        <div>
          <Label htmlFor="terms">Terms</Label>
          <Input id="terms" {...register('terms')} />
          {err(errors.terms?.message)}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="client">Client</Label>
          <select id="client" className={selectCls} value={clientKey} onChange={(e) => pickClient(e.target.value)}>
            <option value={NEW}>New client…</option>
            {clients.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <Textarea rows={6} placeholder={'Company name\nVAT / tax ID\nStreet\nPostcode City, Country'} {...register('clientLinesText')} />
          {err(errors.clientLinesText?.message)}
        </div>
        <div className="grid content-start gap-3">
          <div>
            <Label htmlFor="country">Country</Label>
            <select id="country" className={selectCls} {...register('country')}>
              <option value="">Select…</option>
              {Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            {err(errors.country?.message)}
          </div>
          {w.country === 'ES' && (
            <div>
              <Label htmlFor="serviceType">Service</Label>
              <select id="serviceType" className={selectCls} {...register('serviceType')}>
                <option value="teaching">Teaching (IVA exempt, art. 20.1.9º)</option>
                <option value="other">Other service (IVA 21%)</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select id="currency" className={selectCls} {...register('currency')}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="withholdingPercent">Withholding (%)</Label>
              <Input id="withholdingPercent" type="number" step="0.01" {...register('withholdingPercent', { valueAsNumber: true })} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label>Items</Label>
        {items.fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_6rem_8rem_auto] gap-2">
            <Input placeholder="Description" {...register(`items.${i}.description`)} />
            <Input type="number" step="0.01" placeholder="Qty" {...register(`items.${i}.quantity`, { valueAsNumber: true })} />
            <Input type="number" step="0.01" placeholder="Unit price" {...register(`items.${i}.unitPrice`, { valueAsNumber: true })} />
            <Button type="button" variant="ghost" disabled={items.fields.length === 1} onClick={() => items.remove(i)}>✕</Button>
          </div>
        ))}
        {err(errors.items?.message ?? errors.items?.root?.message)}
        <Button type="button" variant="outline" disabled={items.fields.length >= 8} onClick={() => items.append({ description: '', quantity: 1, unitPrice: 0 })}>
          Add item
        </Button>
        <div className="ml-auto w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
          {tax.irpfRate > 0 && <div className="flex justify-between"><span>IRPF ({pct(tax.irpfRate)})</span><span>−{formatMoney(totals.irpf, currency)}</span></div>}
          <div className="flex justify-between"><span>VAT ({pct(tax.vatRate)})</span><span>{formatMoney(totals.vat, currency)}</span></div>
          {tax.withholdingRate > 0 && <div className="flex justify-between"><span>Withholding ({pct(tax.withholdingRate)})</span><span>−{formatMoney(totals.withholding, currency)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notesText">Notes</Label>
          <Textarea id="notesText" rows={5} {...register('notesText')} />
          {tax.warnings.map((m) => <p key={m} className="text-xs text-amber-600">{m}</p>)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank">Bank account</Label>
          <select id="bank" className={selectCls} value={bankKey} onChange={(e) => pickBank(e.target.value)}>
            {banks.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            <option value={NEW}>New account…</option>
          </select>
          <Textarea rows={5} placeholder={'Name: YANN LUC KLEIN\nBank name: …\nBIC/SWIFT Code : …\nIBAN: …'} {...register('bankLinesText')} />
          {err(errors.bankLinesText?.message)}
        </div>
      </section>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invoice'}</Button>
    </form>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npx vitest run` → all PASS. Run: `npm run build` → succeeds.

Manual check against the real Drive. Ask Yann first, because it writes test invoices. Delete each one afterwards.
1. `/invoices/new` → choose "LE WAGON SPAIN, S.L". The country is Spain, the service is Teaching, the terms are "Due 45 days after receipt", the bank is "Caixabank ····1447", and the number is `202610001`. Both Spanish notes appear.
2. Add the item "TEST" with qty 1 and price 100. The totals panel shows €100 / IRPF −€7 / total €93. Create the invoice. You're redirected to the detail page, the sheet "Invoice LE WAGON SPAIN, S.L - Oct 2026 - 202610001" is in the folder, it looks like 202609003, and its total is €93.00 (computed by formula). The notes show as text, not `#ERROR!`.
3. Switch the service to "Other service". The notes become just the IRPF note and the total is €114.
4. Choose "New Normdesign. Inc". The country is Japan, the currency is JPY, withholding is 10.21 and the SMBC bank is selected. Create a ¥450,000 invoice. The sheet has withholding rows, an 8-line bank block, the total ¥404,055, and the label "TOTAL after withholding tax".
5. Choose "New client…", enter only "Test Co", and leave the country empty. The form refuses to submit and shows "Pick a country".
6. Download a PDF of test invoice 1 and check it looks right.
7. Trash the test invoices in Drive and click **Sync**. They disappear from the list.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: create invoices from history defaults with live totals and legal notes"
```

---

### Task 12: Container and Coolify deploy

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `next.config.ts` (add `output: 'standalone'`), `README.md` (add a Deploy section)

- [ ] **Step 1: Configure standalone output**

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = { output: 'standalone' };

export default nextConfig;
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore`:

```
node_modules
.next
.git
.env*
docs
tests
```

- [ ] **Step 3: Build and run locally**

```bash
docker build -t yann-invoice .
docker run --rm -p 3000:3000 --env-file .env.local yann-invoice
```

Expected: http://localhost:3000 signs in and lists invoices, the same as `npm run dev`.

- [ ] **Step 4: Add a Deploy section to `README.md`**

```markdown
## Deploy (Coolify)

1. Push this repo to GitHub (private).
2. Coolify → New resource → this repo → Build pack **Dockerfile**, port 3000, domain `invoice.yannklein.dev`.
3. Environment: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL`, `AUTH_TRUST_HOST=true`, `AUTH_URL=https://invoice.yannklein.dev`.
4. Deploy. Confirm `https://invoice.yannklein.dev/api/auth/callback/google` is listed in the OAuth client's redirect URIs.
```

- [ ] **Step 5: Deploy** (Yann does this or approves it; it's outward-facing)

Follow the README steps.

Then check: open https://invoice.yannklein.dev, sign in as yann.luc.klein@gmail.com and see the list, then sign in from a private window with another Google account and get refused.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Docker standalone build and Coolify deploy docs"
```
