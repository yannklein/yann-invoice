import { z } from 'zod';
import { taxRulesFor } from './taxRules';
import type { InvoiceDraft, Settings } from './types';

export const splitLines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

export const draftSchema = z.object({
  number: z.string().trim().min(1, 'Required'),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  terms: z.string().trim().min(1, 'Required'),
  clientLinesText: z.string().refine((s) => splitLines(s).length > 0, 'At least the client name'),
  country: z.string().regex(/^[A-Z]{2}$/, 'Pick a country'),
  serviceType: z.enum(['teaching', 'other']),
  currency: z.enum(['EUR', 'JPY', 'USD']),
  withholdingPercent: z.number().min(0).max(50),
  items: z
    .array(z.object({ description: z.string().trim().min(1, 'Required'), quantity: z.number().positive(), unitPrice: z.number().min(0) }))
    .min(1)
    .max(8),
  notesText: z.string(),
  bankLinesText: z.string().refine((s) => splitLines(s).length > 0, 'Bank details required'),
});

export type DraftForm = z.infer<typeof draftSchema>;

export function toDraft(f: DraftForm, settings: Settings): InvoiceDraft {
  const clientLines = splitLines(f.clientLinesText);
  const withholdingRate = Math.round(f.withholdingPercent * 1e4) / 1e6;
  const tax = taxRulesFor({ country: f.country, serviceType: f.serviceType, withholdingRate, clientLines }, settings);
  return {
    number: f.number.trim(),
    issueDate: f.issueDate,
    terms: f.terms.trim(),
    clientLines,
    country: f.country,
    serviceType: f.serviceType,
    currency: f.currency,
    items: f.items.map((i) => ({ ...i, description: i.description.trim() })),
    vatRate: tax.vatRate,
    irpfRate: tax.irpfRate,
    withholdingRate: tax.withholdingRate,
    notes: splitLines(f.notesText),
    bankLines: splitLines(f.bankLinesText),
  };
}
