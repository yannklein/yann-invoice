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
