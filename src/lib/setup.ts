import type { Google } from '@/lib/google/client';
import { FOLDER_MIME, ROLE_KEY, SHEET_MIME, clearIdsCache, findByRole, listAll, type AppIds } from '@/lib/google/drive';
import { INDEX_HEADER, settingsToValues } from '@/lib/index/rows';
import { syncIndex } from '@/lib/index/store';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

/** "Invoice Le Wagon Spain - 202609003": current sender block, IRPF row — the template source. */
export const TEMPLATE_SOURCE_ID = '1WHSl3CWOMQo8RIu3SIkKnCXzl9O84_lLsPqSGHWOrI8';

export const isLegacyInvoiceName = (name: string) => /^Invoice\s/.test(name);

export async function previewSetup(g: Google): Promise<{ id: string; name: string; parents: string[] }[]> {
  const folderId = await findByRole(g.drive, 'folder');
  const files = await listAll(
    g.drive,
    `mimeType='${SHEET_MIME}' and 'me' in owners and trashed=false and name contains 'Invoice'`,
    'id,name,parents,appProperties',
  );
  return files
    .filter((f) => isLegacyInvoiceName(f.name ?? '') && !f.appProperties?.[ROLE_KEY] && !(folderId && f.parents?.includes(folderId)))
    .map((f) => ({ id: f.id!, name: f.name!, parents: f.parents ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function moveInto(g: Google, fileId: string, folderId: string) {
  const { data } = await g.drive.files.get({ fileId, fields: 'parents' });
  await g.drive.files.update({ fileId, addParents: folderId, removeParents: (data.parents ?? []).join(','), fields: 'id' });
}

/** Idempotent: re-running only does the missing steps. */
export async function runSetup(g: Google): Promise<AppIds> {
  const folderId =
    (await findByRole(g.drive, 'folder')) ??
    (await g.drive.files.create({ fields: 'id', requestBody: { name: 'Invoices', mimeType: FOLDER_MIME, appProperties: { [ROLE_KEY]: 'folder' } } })).data.id!;

  for (const f of await previewSetup(g)) await moveInto(g, f.id, folderId);

  const templateId =
    (await findByRole(g.drive, 'template')) ??
    (await g.drive.files.copy({
      fileId: TEMPLATE_SOURCE_ID,
      fields: 'id',
      requestBody: { name: 'Invoice Template', parents: [folderId], appProperties: { [ROLE_KEY]: 'template' } },
    })).data.id!;

  let indexId = await findByRole(g.drive, 'index');
  if (!indexId) {
    const created = await g.sheets.spreadsheets.create({
      requestBody: { properties: { title: 'Invoice Index' }, sheets: [{ properties: { title: 'Invoices' } }, { properties: { title: 'Settings' } }] },
    });
    indexId = created.data.spreadsheetId!;
    await g.drive.files.update({ fileId: indexId, requestBody: { appProperties: { [ROLE_KEY]: 'index' } } });
    await moveInto(g, indexId, folderId);
    await g.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: indexId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Invoices!A1:J1', values: [INDEX_HEADER] },
          { range: 'Settings!A1:B3', values: [['key', 'value'], ...settingsToValues(DEFAULT_SETTINGS)] },
        ],
      },
    });
  }

  clearIdsCache();
  const ids = { folderId, indexId, templateId };
  await syncIndex(g, ids, { full: true });
  return ids;
}
