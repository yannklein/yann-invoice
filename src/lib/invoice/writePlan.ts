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

/**
 * Notes sit in single, unmerged A cells and overflow to the right, so anything wider than A:F is clipped
 * in the sheet and the PDF. 95 characters of Arial 10 sentence text is ~570px against A:F's ~660px.
 */
const NOTE_WIDTH = 95;

/** Break a note at spaces into lines that fit A:F; continuations of a "- " note line up under its text. */
export function wrapNote(note: string, width = NOTE_WIDTH): string[] {
  const indent = note.startsWith('- ') ? '  ' : '';
  const lines: string[] = [];
  const head = () => (lines.length ? indent : '');
  let line = '';
  for (let word of note.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    while (head().length + word.length > width) {
      const room = width - head().length;
      lines.push(head() + word.slice(0, room));
      word = word.slice(room);
    }
    line = word && head() + word;
  }
  if (line) lines.push(line);
  return lines;
}

const noteLines = (d: InvoiceDraft) => d.notes.flatMap((n) => wrapNote(n));

const bankCapacity = (grid: Grid, L: Located) => Math.max(0, lastNonEmptyRow(grid, A) - L.bankRow);

interface RowOp {
  at: number;
  kind: 'delete' | 'insert';
  requests: Request[];
}

/**
 * Row inserts/deletes, applied bottom-up so each request's row indices are still valid.
 * At the same row a delete runs before an insert, so the delete never hits a freshly inserted row.
 */
export function planStructure(layout: Layout, grid: Grid, d: InvoiceDraft, sheetId: number): Request[] {
  const L = need(layout);
  const ops: RowOp[] = [];
  const insert = (at: number, count: number, ...extra: Request[]) =>
    ops.push({ at, kind: 'insert', requests: [insertRows(sheetId, at, count), ...extra] });
  const remove = (from: number, to: number) => ops.push({ at: from, kind: 'delete', requests: [deleteRows(sheetId, from, to)] });

  const bankHave = bankCapacity(grid, L);
  if (d.bankLines.length > bankHave) insert(L.bankRow + 1 + bankHave, d.bankLines.length - bankHave);

  const notesHave = L.bankRow - L.notesRow - 1;
  const notes = noteLines(d).length;
  if (notes > notesHave) insert(L.bankRow, notes - notesHave);

  if (d.withholdingRate > 0 && L.whtRateRow == null) {
    if (L.vatAmountRow !== L.vatRateRow + 1) throw new Error('Invoice template VAT rows must be adjacent');
    const at = L.vatAmountRow + 1;
    insert(
      at,
      2,
      copyRows(sheetId, L.vatRateRow, L.vatAmountRow + 1, at),
      setText(sheetId, at, A, 'WITHHOLDING TAX RATE'),
      setText(sheetId, at + 1, E, 'WITHHOLDING'),
    );
  }
  if (d.withholdingRate === 0 && L.whtRateRow != null) remove(L.whtRateRow, (L.whtAmountRow ?? L.whtRateRow) + 1);

  if (d.irpfRate > 0 && L.irpfRow == null) throw new Error('Invoice template has no IRPF row');
  if (d.irpfRate === 0 && L.irpfRow != null) remove(L.irpfRow, L.irpfRow + 1);

  const clientHave = L.descriptionRow - 1 - L.clientRow;
  if (d.clientLines.length > clientHave) insert(L.descriptionRow - 1, d.clientLines.length - clientHave);

  return ops
    .sort((x, y) => y.at - x.at || (x.kind === y.kind ? 0 : x.kind === 'delete' ? -1 : 1))
    .flatMap((op) => op.requests);
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

  const hasWht = L.whtRateRow != null && L.whtAmountRow != null;
  if ((d.withholdingRate > 0) !== hasWht) throw new Error('Sheet withholding rows do not match the invoice withholding rate');
  if ((d.irpfRate > 0) !== (L.irpfRow != null)) throw new Error('Sheet IRPF row does not match the invoice IRPF rate');

  const dp = decimalsFor(d.currency);
  const sub = L.subtotalRow + 1;
  entered.push({ range: `F${sub}`, values: [[`=ROUND(SUM(F${itemStart + 1}:F${itemStart + itemCap}),${dp})`]] });

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

  column('A', L.notesRow + 1, pad(noteLines(d), L.bankRow - L.notesRow - 1));
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
