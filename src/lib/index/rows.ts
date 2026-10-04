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
