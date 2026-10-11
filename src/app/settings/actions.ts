'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { settingsFromForm } from '@/lib/index/rows';
import { syncIndex, writeSettings } from '@/lib/index/store';
import { runSetup } from '@/lib/setup';
import { currentMonth } from '@/lib/shared/model';
import { parseSheetId, runImport } from '@/lib/shared/store';

export async function runSetupAction() {
  const g = await getGoogle();
  await runSetup(g);
  revalidatePath('/');
  redirect('/');
}

export async function saveSettingsAction(formData: FormData) {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const settings = settingsFromForm(String(formData.get('irpfPercent') ?? ''), String(formData.get('defaultTerms') ?? ''));
  if (!settings) return;
  await writeSettings(g.sheets, ids.indexId, settings);
  revalidatePath('/settings');
}

export async function fullResyncAction() {
  const g = await getGoogle();
  await syncIndex(g, await requireIds(g), { full: true });
  revalidatePath('/');
  redirect('/');
}

export async function previewSharedImportAction(formData: FormData) {
  const id = parseSheetId(String(formData.get('sheet') ?? ''));
  redirect(id ? `/settings?shared=${id}#shared` : '/settings?sharedError=1#shared');
}

export async function runSharedImportAction(formData: FormData) {
  const id = parseSheetId(String(formData.get('sheet') ?? ''));
  if (!id) redirect('/settings?sharedError=1#shared');
  const g = await getGoogle();
  await runImport(g, id, currentMonth());
  revalidatePath('/shared');
  redirect('/shared');
}
