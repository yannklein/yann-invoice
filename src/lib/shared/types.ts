export type Kind = 'income' | 'expense';
export type LineCurrency = 'JPY' | 'EUR';
export const LINE_CURRENCIES: LineCurrency[] = ['JPY', 'EUR'];

/** A tax (or other) amount paid as `total / count`; this line is payment number `index` (1-based). */
export interface Instalment {
  total: number;
  index: number;
  count: number;
}

/** One income or expense line of a month, in its own currency. */
export interface Line {
  month: string; // YYYY-MM
  kind: Kind;
  label: string;
  amount: number;
  currency: LineCurrency;
  invoiceId: string | null; // Drive file id of the invoice this income came from
  inst: Instalment | null;
  note: string;
}

export interface MonthRecord {
  month: string; // YYYY-MM
  fxJpyPerEur: number;
  note: string;
  updatedAt: string; // ISO timestamp
}
