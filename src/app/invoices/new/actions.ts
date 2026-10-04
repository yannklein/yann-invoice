'use server';

import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { createInvoiceSheet } from '@/lib/google/writeInvoice';
import { indexFile, readSettings } from '@/lib/index/store';
import { sheetUrl } from '@/lib/invoice/pdf';
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
  } catch (e) {
    return { error: `Could not create the invoice: ${e instanceof Error ? e.message : String(e)}` };
  }
  // The sheet exists from here on: never report failure, or a retry would create a duplicate.
  try {
    await indexFile(g, ids, id);
  } catch (e) {
    console.error(`[create] invoice ${id} created but not indexed yet`, e);
    redirect(sheetUrl(id)); // the next sync will index it
  }
  redirect(`/invoices/${id}`);
}
