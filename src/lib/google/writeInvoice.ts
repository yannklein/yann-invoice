import { locate } from '@/lib/invoice/layout';
import type { InvoiceDraft } from '@/lib/invoice/types';
import { invoiceTitle, planFormats, planStructure, planValues, type ValueRange } from '@/lib/invoice/writePlan';
import type { Google } from './client';
import { ROLE_KEY, readGrid, type AppIds } from './drive';

/** Copy the template, reshape rows, fill values, format money. Trashes the copy if anything fails. */
export async function createInvoiceSheet(g: Google, ids: AppIds, d: InvoiceDraft): Promise<string> {
  const copy = await g.drive.files.copy({
    fileId: ids.templateId,
    fields: 'id',
    requestBody: {
      name: invoiceTitle(d),
      parents: [ids.folderId],
      appProperties: { [ROLE_KEY]: 'invoice', country: d.country, serviceType: d.serviceType },
    },
  });
  const id = copy.data.id!;
  try {
    const meta = await g.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(sheetId,title)' });
    const { sheetId, title } = meta.data.sheets![0].properties!;
    const at = (v: ValueRange) => ({ ...v, range: `'${title!.replace(/'/g, "''")}'!${v.range}` });

    let grid = await readGrid(g.sheets, id);
    const structure = planStructure(locate(grid), grid, d, sheetId!);
    if (structure.length) {
      await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: structure } });
      grid = await readGrid(g.sheets, id);
    }
    const layout = locate(grid);
    const { raw, entered } = planValues(layout, grid, d);
    await g.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'RAW', data: raw.map(at) } });
    await g.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'USER_ENTERED', data: entered.map(at) } });
    await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: planFormats(layout, d, sheetId!) } });
    return id;
  } catch (e) {
    await g.drive.files.update({ fileId: id, requestBody: { trashed: true } }).catch(() => undefined);
    throw e;
  }
}
