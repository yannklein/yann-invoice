import type { sheets_v4 } from 'googleapis';
import { listInvoiceFiles, readGrid, type AppIds } from '@/lib/google/drive';
import type { Google } from '@/lib/google/client';
import { sortNewest, type IndexRow } from '@/lib/invoice/derive';
import { parseInvoice } from '@/lib/invoice/parse';
import type { Settings } from '@/lib/invoice/types';
import { diffFiles, metaFromAppProperties, rowToValues, settingsFromValues, settingsToValues, valuesToRow } from './rows';

const INVOICES_RANGE = 'Invoices!A2:J';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readIndex(sheets: sheets_v4.Sheets, indexId: string): Promise<IndexRow[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: indexId, range: INVOICES_RANGE });
  return (res.data.values ?? []).map(valuesToRow).filter((r): r is IndexRow => r !== null);
}

export async function writeIndex(sheets: sheets_v4.Sheets, indexId: string, rows: IndexRow[]): Promise<void> {
  await sheets.spreadsheets.values.clear({ spreadsheetId: indexId, range: INVOICES_RANGE });
  if (!rows.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: indexId,
    range: 'Invoices!A2',
    valueInputOption: 'RAW',
    requestBody: { values: rows.map(rowToValues) },
  });
}

export async function readSettings(sheets: sheets_v4.Sheets, indexId: string): Promise<Settings> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: indexId, range: 'Settings!A2:B' });
  return settingsFromValues(res.data.values ?? []);
}

export async function writeSettings(sheets: sheets_v4.Sheets, indexId: string, s: Settings): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId: indexId,
    range: 'Settings!A2:B3',
    valueInputOption: 'RAW',
    requestBody: { values: settingsToValues(s) },
  });
}

/** Re-parse only new or modified invoice sheets. Full mode rebuilds the whole index. */
export async function syncIndex(g: Google, ids: AppIds, opts: { full?: boolean } = {}): Promise<IndexRow[]> {
  const [files, existing] = await Promise.all([
    listInvoiceFiles(g.drive, ids.folderId),
    opts.full ? Promise.resolve([] as IndexRow[]) : readIndex(g.sheets, ids.indexId),
  ]);
  const { toParse, kept, changed } = diffFiles(files, existing, !!opts.full);
  if (!changed) return sortNewest(existing);

  const throttle = toParse.length > 40; // stay under 60 Sheets reads/min/user
  const parsed: IndexRow[] = [];
  for (const f of toParse) {
    try {
      const grid = await readGrid(g.sheets, f.id);
      parsed.push({ fileId: f.id, title: f.name, modifiedTime: f.modifiedTime, meta: metaFromAppProperties(f.appProperties), invoice: parseInvoice(grid, f.name) });
    } catch (e) {
      console.error(`[sync] could not read ${f.name} (${f.id})`, e);
    }
    if (throttle) await sleep(1100);
  }
  const rows = sortNewest([...kept, ...parsed]);
  await writeIndex(g.sheets, ids.indexId, rows);
  return rows;
}
