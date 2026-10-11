'use server';

import { revalidatePath } from 'next/cache';
import { getGoogle } from '@/lib/google/client';
import { monthFormSchema, toLines, type MonthForm } from '@/lib/shared/schema';
import { findSharedId, saveMonth } from '@/lib/shared/store';

export async function saveMonthAction(form: MonthForm): Promise<{ error: string } | { savedAt: string }> {
  const parsed = monthFormSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };

  const g = await getGoogle();
  const id = await findSharedId(g.drive);
  if (!id) return { error: 'The shared account sheet is not imported yet (see Settings).' };
  const { month, fxJpyPerEur, note } = parsed.data;
  const savedAt = new Date().toISOString();
  try {
    await saveMonth(g.sheets, id, { month, fxJpyPerEur, note: note.trim(), updatedAt: savedAt }, toLines(parsed.data));
  } catch (e) {
    return { error: `Could not save: ${e instanceof Error ? e.message : String(e)}` };
  }
  revalidatePath('/shared');
  return { savedAt };
}
