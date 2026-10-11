import { z } from 'zod';
import { roundMoney } from '@/lib/invoice/totals';
import { MONTH_RE } from './model';
import type { Line } from './types';

const instSchema = z
  .object({ total: z.number().positive(), index: z.number().int().min(1), count: z.number().int().min(2).max(24) })
  .refine((i) => i.index <= i.count, { message: 'Payment number is past the count', path: ['index'] });

export const lineSchema = z.object({
  kind: z.enum(['income', 'expense']),
  label: z.string().trim().min(1, 'Required'),
  amount: z.number('Required'), // z.number() already rejects NaN and ±Infinity
  currency: z.enum(['JPY', 'EUR']),
  invoiceId: z.string().nullable(),
  inst: instSchema.nullable(),
  note: z.string(),
});

export const monthFormSchema = z.object({
  month: z.string().regex(MONTH_RE, 'Use YYYY-MM'),
  fxJpyPerEur: z.number('Required').positive('Must be positive'),
  note: z.string(),
  lines: z
    .array(lineSchema)
    .max(100)
    .refine((ls) => {
      const ids = ls.map((l) => l.invoiceId).filter(Boolean);
      return new Set(ids).size === ids.length;
    }, 'The same invoice is counted twice'),
});

export type MonthForm = z.infer<typeof monthFormSchema>;
export type LineForm = z.infer<typeof lineSchema>;

export function toLines(f: MonthForm): Line[] {
  return f.lines.map((l) => ({ ...l, month: f.month, label: l.label.trim(), amount: roundMoney(l.amount, l.currency) }));
}
