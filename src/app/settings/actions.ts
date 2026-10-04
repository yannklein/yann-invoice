'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex, writeSettings } from '@/lib/index/store';
import { runSetup } from '@/lib/setup';

export async function runSetupAction() {
  const g = await getGoogle();
  await runSetup(g);
  revalidatePath('/');
  redirect('/');
}

export async function saveSettingsAction(formData: FormData) {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const irpfPercent = Number(formData.get('irpfPercent'));
  const defaultTerms = String(formData.get('defaultTerms') ?? '').trim();
  if (!Number.isFinite(irpfPercent) || irpfPercent < 0 || irpfPercent > 50 || !defaultTerms) return;
  await writeSettings(g.sheets, ids.indexId, { irpfRate: Math.round(irpfPercent * 1e4) / 1e6, defaultTerms });
  revalidatePath('/settings');
}

export async function fullResyncAction() {
  const g = await getGoogle();
  await syncIndex(g, await requireIds(g), { full: true });
  revalidatePath('/');
  redirect('/');
}
