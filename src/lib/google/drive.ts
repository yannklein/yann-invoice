import type { drive_v3, sheets_v4 } from 'googleapis';
import { redirect } from 'next/navigation';
import { normalizeGrid, type Grid } from '@/lib/invoice/cells';
import type { DriveInvoiceFile } from '@/lib/index/rows';
import type { Google } from './client';

export const ROLE_KEY = 'yannInvoiceRole';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export type Role = 'folder' | 'index' | 'template' | 'invoice' | 'shared';

export interface AppIds {
  folderId: string;
  indexId: string;
  templateId: string;
}

export async function listAll(drive: drive_v3.Drive, q: string, fields: string): Promise<drive_v3.Schema$File[]> {
  const out: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({ q, fields: `nextPageToken, files(${fields})`, pageSize: 200, pageToken, spaces: 'drive' });
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function findByRole(drive: drive_v3.Drive, role: Role): Promise<string | null> {
  const files = await listAll(drive, `appProperties has { key='${ROLE_KEY}' and value='${role}' } and trashed=false`, 'id');
  return files[0]?.id ?? null;
}

let cache: AppIds | null = null;
export function clearIdsCache() {
  cache = null;
}

export async function resolveIds(drive: drive_v3.Drive): Promise<AppIds | null> {
  if (cache) return cache;
  const [folderId, indexId, templateId] = await Promise.all(
    (['folder', 'index', 'template'] as const).map((r) => findByRole(drive, r)),
  );
  if (!folderId || !indexId || !templateId) return null;
  return (cache = { folderId, indexId, templateId });
}

export async function requireIds(g: Google): Promise<AppIds> {
  const ids = await resolveIds(g.drive);
  if (!ids) redirect('/settings');
  return ids;
}

export async function listInvoiceFiles(drive: drive_v3.Drive, folderId: string): Promise<DriveInvoiceFile[]> {
  const files = await listAll(
    drive,
    `'${folderId}' in parents and mimeType='${SHEET_MIME}' and trashed=false`,
    'id,name,modifiedTime,appProperties',
  );
  return files
    .filter((f) => !['index', 'template'].includes(f.appProperties?.[ROLE_KEY] ?? ''))
    .map((f) => ({ id: f.id!, name: f.name!, modifiedTime: f.modifiedTime!, appProperties: f.appProperties ?? {} }));
}

export async function readGrid(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<Grid> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A1:F80', valueRenderOption: 'FORMATTED_VALUE' });
  return normalizeGrid(res.data.values);
}
