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
