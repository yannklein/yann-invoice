'use server';

import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { createInvoiceSheet } from '@/lib/google/writeInvoice';
import { readSettings, syncIndex } from '@/lib/index/store';
import { draftSchema, toDraft, type DraftForm } from '@/lib/invoice/schema';

export async function createInvoiceAction(form: DraftForm): Promise<{ error: string } | undefined> {
  const parsed = draftSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };

  const g = await getGoogle();
  const ids = await requireIds(g);
  let id: string;
  try {
    const settings = await readSettings(g.sheets, ids.indexId);
    id = await createInvoiceSheet(g, ids, toDraft(parsed.data, settings));
    await syncIndex(g, ids);
  } catch (e) {
    return { error: `Could not create the invoice: ${e instanceof Error ? e.message : String(e)}` };
  }
  redirect(`/invoices/${id}`);
}
