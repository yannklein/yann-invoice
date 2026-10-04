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
