import { clientKey, effectiveCountry, effectiveServiceType, type IndexRow } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import { addMonths, invoiceMonth } from '@/lib/shared/model';
import type { Line } from '@/lib/shared/types';
import { convert, type Fx } from './convert';
import { monthDiff, type DisplayCurrency } from './period';

/** One invoice's revenue (subtotal) in the display currency, at its month's rate. */
export interface RevenueEntry {
  row: IndexRow;
  month: string;
  amount: number;
}

export function revenueEntries(rows: IndexRow[], ccy: DisplayCurrency, fx: Fx): RevenueEntry[] {
  return rows
    .filter((r) => r.invoice.subtotal != null)
    .map((r) => {
      const month = invoiceMonth(r);
      return { row: r, month, amount: convert(r.invoice.subtotal!, r.invoice.currency, ccy, month, fx) };
    });
}

/** Invoices in `months` whose `field` could not be read (left out of the figures). */
export const skippedIn = (rows: IndexRow[], months: string[], field: 'subtotal' | 'total') =>
  rows.filter((r) => r.invoice[field] == null && months.includes(invoiceMonth(r))).length;

const sum = (xs: number[], ccy: DisplayCurrency) => roundMoney(xs.reduce((a, b) => a + b, 0), ccy);

export interface ShareRow {
  key: string;
  name: string;
  amount: number;
  pct: number; // 0..1 of the period's revenue
}

/** Revenue in `months` grouped by `group`, largest first. Each group is named after its newest invoice. */
export function shareBy(
  entries: RevenueEntry[],
  months: string[],
  ccy: DisplayCurrency,
  group: (r: IndexRow) => { key: string; name: string },
): ShareRow[] {
  const inPeriod = entries.filter((e) => months.includes(e.month)).sort((a, b) => b.month.localeCompare(a.month));
  const acc = new Map<string, { name: string; amount: number }>();
  for (const e of inPeriod) {
    const { key, name } = group(e.row);
    const g = acc.get(key) ?? { name, amount: 0 };
    acc.set(key, { name: g.name, amount: g.amount + e.amount });
  }
  const total = [...acc.values()].reduce((a, g) => a + g.amount, 0);
  return [...acc]
    .map(([key, g]) => ({ key, name: g.name, amount: roundMoney(g.amount, ccy), pct: total ? g.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export const byClient = (r: IndexRow) => ({ key: clientKey(r.invoice.clientName), name: r.invoice.clientName.trim() });
export const byCountry = (r: IndexRow) => {
  const c = effectiveCountry(r);
  return { key: c, name: c === 'unknown' ? 'Unknown' : c };
};
export const byService = (r: IndexRow) => {
  const s = effectiveServiceType(r);
  return { key: s, name: s === 'teaching' ? 'Teaching' : 'Other' };
};

export type Slot = 's1' | 's2' | 's3' | 's4' | 'other';
const SLOTS: Slot[] = ['s1', 's2', 's3', 's4'];

/** One bar: revenue per client slot, the month's total, and the same month a year earlier. */
export type RevenuePoint = { month: string; total: number; lastYear: number } & Partial<Record<Slot, number>>;

export interface RevenueData {
  series: { slot: Slot; name: string }[];
  months: RevenuePoint[];
  total: number;
  previousTotal: number; // the same months one year earlier
  changePct: number | null;
}

/** Monthly revenue stacked by the 4 largest clients of the period, the rest folded into "Other". */
export function revenueByMonth(entries: RevenueEntry[], months: string[], ccy: DisplayCurrency): RevenueData {
  const top = shareBy(entries, months, ccy, byClient);
  const slotOf = new Map(top.slice(0, 4).map((c, i) => [c.key, SLOTS[i]]));
  const series: RevenueData['series'] = top.slice(0, 4).map((c, i) => ({ slot: SLOTS[i], name: c.name }));
  if (top.length > 4) series.push({ slot: 'other', name: 'Other' });

  const totalOf = (m: string) => sum(entries.filter((e) => e.month === m).map((e) => e.amount), ccy);
  const points = months.map((month) => {
    const p: RevenuePoint = { month, total: totalOf(month), lastYear: totalOf(addMonths(month, -12)) };
    for (const e of entries) {
      if (e.month !== month) continue;
      const slot = slotOf.get(byClient(e.row).key) ?? 'other';
      p[slot] = roundMoney((p[slot] ?? 0) + e.amount, ccy);
    }
    return p;
  });
  const total = sum(points.map((p) => p.total), ccy);
  const previousTotal = sum(points.map((p) => p.lastYear), ccy);
  return { series, months: points, total, previousTotal, changePct: previousTotal ? (total - previousTotal) / previousTotal : null };
}

/**
 * First invoice month tracked as unpaid: the first month that links an invoice (or this month, before any link).
 * Earlier invoices may have been paid in months imported from the legacy tabs, which carry no links, so they cannot
 * be told apart from unpaid ones.
 */
export function unpaidFrom(lines: Line[], now: string): string {
  const linked = lines.filter((l) => l.kind === 'income' && l.invoiceId).map((l) => l.month).sort()[0];
  return linked && linked < now ? linked : now;
}

export interface UnpaidRow {
  fileId: string;
  number: string;
  client: string;
  month: string;
  total: number; // in the invoice's own currency
  currency: 'JPY' | 'EUR';
  ageMonths: number;
}

/** JPY/EUR invoices since `unpaidFrom` that no shared income line links to, oldest first. */
export function unpaid(rows: IndexRow[], lines: Line[], now: string, ccy: DisplayCurrency, fx: Fx): { rows: UnpaidRow[]; total: number; from: string } {
  const from = unpaidFrom(lines, now);
  const linked = new Set(lines.map((l) => l.invoiceId).filter(Boolean));
  const out = rows
    .flatMap((r): UnpaidRow[] => {
      const { total, currency } = r.invoice;
      const month = invoiceMonth(r);
      if (total == null || (currency !== 'JPY' && currency !== 'EUR') || month < from || linked.has(r.fileId)) return [];
      return [{ fileId: r.fileId, number: r.invoice.number ?? r.title, client: r.invoice.clientName, month, total, currency, ageMonths: Math.max(0, monthDiff(month, now)) }];
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.number.localeCompare(b.number));
  return { rows: out, total: sum(out.map((u) => convert(u.total, u.currency, ccy, now, fx)), ccy), from };
}

export interface DelayRow {
  key: string;
  name: string;
  months: number; // median months from invoice month to the month it reached the bank
  count: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Per client, the median delay between an invoice's month and the shared month whose income line links it. */
export function paymentDelay(rows: IndexRow[], lines: Line[]): DelayRow[] {
  const byId = new Map(rows.map((r) => [r.fileId, r]));
  const acc = new Map<string, { name: string; delays: number[] }>();
  for (const l of lines) {
    const r = l.kind === 'income' && l.invoiceId ? byId.get(l.invoiceId) : undefined;
    if (!r) continue;
    const { key, name } = byClient(r);
    const g = acc.get(key) ?? { name, delays: [] };
    g.delays.push(monthDiff(invoiceMonth(r), l.month));
    acc.set(key, g);
  }
  return [...acc]
    .map(([key, g]) => ({ key, name: g.name, months: median(g.delays), count: g.delays.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
