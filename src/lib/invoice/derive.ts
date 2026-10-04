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
