import type { drive_v3, sheets_v4 } from 'googleapis';
import { findByRole, listAll, ROLE_KEY } from '@/lib/google/drive';
import { importLegacy, type ImportResult, type LegacyTab } from './importLegacy';
import { LINES_HEADER, lineToValues, MONTHS_HEADER, monthToValues, padRows, replaceMonthRows, valuesToLine, valuesToMonth } from './rows';
import type { Line, MonthRecord } from './types';

const MONTHS_RANGE = 'Months!A2:D';
const LINES_RANGE = 'Lines!A2:J';
const APP_TABS = ['Months', 'Lines'];

export const findSharedId = (drive: drive_v3.Drive) => findByRole(drive, 'shared');

export interface SharedData {
  months: MonthRecord[];
  lines: Line[];
  invalidRows: number; // rows in Months/Lines that do not parse (left untouched in the sheet)
}

async function readRaw(sheets: sheets_v4.Sheets, id: string): Promise<{ months: unknown[][]; lines: unknown[][] }> {
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: [MONTHS_RANGE, LINES_RANGE], valueRenderOption: 'UNFORMATTED_VALUE' });
  const [months, lines] = (res.data.valueRanges ?? []).map((r) => (r.values ?? []) as unknown[][]);
  return { months: months ?? [], lines: lines ?? [] };
}

const nonBlank = (r: unknown[]) => r.some((c) => String(c ?? '').trim() !== '');

export async function readShared(sheets: sheets_v4.Sheets, id: string): Promise<SharedData> {
  const raw = await readRaw(sheets, id);
  const months = raw.months.filter(nonBlank).map(valuesToMonth);
  const lines = raw.lines.filter(nonBlank).map(valuesToLine);
  const ok = <T,>(x: T | null): x is T => x !== null;
  return {
    months: months.filter(ok).sort((a, b) => a.month.localeCompare(b.month)),
    lines: lines.filter(ok),
    invalidRows: months.length + lines.length - months.filter(ok).length - lines.filter(ok).length,
  };
}

/**
 * Replace one month's lines and upsert its Months row in a single batchUpdate. Both tables are rebuilt from the raw
 * rows just read and padded with blanks, so nothing is cleared first and rows of other months are kept as they are.
 */
export async function saveMonth(sheets: sheets_v4.Sheets, id: string, rec: MonthRecord, lines: Line[]): Promise<void> {
  const raw = await readRaw(sheets, id);
  const months = replaceMonthRows(raw.months.filter(nonBlank), rec.month, [monthToValues(rec)]);
  const all = replaceMonthRows(raw.lines.filter(nonBlank), rec.month, lines.map(lineToValues));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: 'Months!A2', values: padRows(months, raw.months.length, MONTHS_HEADER.length) },
        { range: 'Lines!A2', values: padRows(all, raw.lines.length, LINES_HEADER.length) },
      ],
    },
  });
}

export function parseSheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) ?? s.match(/^([A-Za-z0-9_-]{20,})$/);
  return m?.[1] ?? null;
}

export interface ImportPreview extends ImportResult {
  title: string;
  hasAppTabs: boolean;
}

/** Read every legacy tab with formulas and values (two requests) and run the pure importer. */
export async function previewImport(sheets: sheets_v4.Sheets, id: string, currentMonth: string): Promise<ImportPreview> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title,sheets.properties.title' });
  const names = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
  const legacy = names.filter((n) => !APP_TABS.includes(n));
  const ranges = legacy.map((n) => `'${n.replace(/'/g, "''")}'!A1:I40`);
  const get = (valueRenderOption: 'FORMULA' | 'UNFORMATTED_VALUE') =>
    ranges.length ? sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges, valueRenderOption }) : null;
  const [formulas, values] = await Promise.all([get('FORMULA'), get('UNFORMATTED_VALUE')]);
  const tabs: LegacyTab[] = legacy.map((name, i) => ({
    name,
    formulas: (formulas?.data.valueRanges?.[i]?.values ?? []) as unknown[][],
    values: (values?.data.valueRanges?.[i]?.values ?? []) as unknown[][],
  }));
  return { ...importLegacy(tabs, currentMonth), title: meta.data.properties?.title ?? '', hasAppTabs: APP_TABS.some((t) => names.includes(t)) };
}

/** Create (or overwrite) the Months and Lines tabs from the legacy tabs and mark the file as the app's shared sheet. */
export async function runImport(g: { drive: drive_v3.Drive; sheets: sheets_v4.Sheets }, id: string, currentMonth: string): Promise<void> {
  const preview = await previewImport(g.sheets, id, currentMonth);
  const meta = await g.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' });
  const existing = (meta.data.sheets ?? []).map((s) => s.properties?.title);
  const missing = APP_TABS.filter((t) => !existing.includes(t));
  if (missing.length) {
    await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
  }
  const now = new Date().toISOString();
  const months = preview.months.map((m) => monthToValues({ month: m.month, fxJpyPerEur: m.fx, note: '', updatedAt: now }));
  const lines = preview.months.flatMap((m) => m.lines.map(lineToValues));
  await g.sheets.spreadsheets.values.batchClear({ spreadsheetId: id, requestBody: { ranges: ['Months', 'Lines'] } });
  await g.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: 'Months!A1', values: [MONTHS_HEADER, ...months] },
        { range: 'Lines!A1', values: [LINES_HEADER, ...lines] },
      ],
    },
  });
  // Only one file may carry the role, otherwise findByRole would pick one at random.
  const others = await listAll(g.drive, `appProperties has { key='${ROLE_KEY}' and value='shared' } and trashed=false`, 'id');
  for (const f of others) {
    if (f.id !== id) await g.drive.files.update({ fileId: f.id!, requestBody: { appProperties: { [ROLE_KEY]: null } as unknown as Record<string, string> } }); // null deletes the key
  }
  await g.drive.files.update({ fileId: id, requestBody: { appProperties: { [ROLE_KEY]: 'shared' } } });
}
