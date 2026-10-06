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

export const SORT_KEYS = ['number', 'client', 'date', 'total'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/** Direction used when a column is first clicked: text A→Z, numbers and dates newest/largest first. */
export const defaultDir = (key: SortKey): SortDir => (key === 'client' ? 'asc' : 'desc');

export function parseSort(sort?: string, dir?: string): Sort {
  const key = SORT_KEYS.find((k) => k === sort) ?? 'date';
  return { key, dir: dir === 'asc' || dir === 'desc' ? dir : defaultDir(key) };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Missing values always go last, whatever the direction. */
function compareNullable<T>(x: T | null, y: T | null, cmp: (x: T, y: T) => number, sign: number): number {
  if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
  return sign * cmp(x, y);
}

const comparators: Record<SortKey, (a: IndexRow, b: IndexRow, sign: number) => number> = {
  number: (a, b, s) => compareNullable(a.invoice.number, b.invoice.number, collator.compare, s),
  client: (a, b, s) => compareNullable(a.invoice.clientName || null, b.invoice.clientName || null, collator.compare, s),
  date: (a, b, s) => s * sortDate(a).localeCompare(sortDate(b)),
  // Amounts in different currencies are not comparable, so group by currency first.
  total: (a, b, s) =>
    a.invoice.currency.localeCompare(b.invoice.currency) || compareNullable(a.invoice.total, b.invoice.total, (x, y) => x - y, s),
};

/** Sort by one column; ties keep newest-first order. */
export function sortRows(rows: IndexRow[], { key, dir }: Sort): IndexRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return sortNewest(rows).sort((a, b) => comparators[key](a, b, sign));
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
