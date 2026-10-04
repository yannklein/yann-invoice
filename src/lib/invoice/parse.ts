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
