import type { drive_v3, sheets_v4 } from 'googleapis';
import type { Google } from '@/lib/google/client';
import { findByRole, listAll, ROLE_KEY } from '@/lib/google/drive';
import { defaultRowsFor, migrateSeeds } from './defaults';
import type { ImportResult } from './importPlan';
import { APP_TABS, HEADERS, fromRow, parsePortfolio, toRow, type AppTab, type Cell } from './rows';
import type { CashRow, PlanSettings, Portfolio } from './types';

export const findPortfolioId = (drive: drive_v3.Drive) => findByRole(drive, 'portfolio');

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function tabTitles(sheets: sheets_v4.Sheets, id: string): Promise<string[]> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' });
  return (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '');
}

/** All app tabs in one batchGet (missing tabs read as empty). Unparseable rows are counted, not dropped silently. */
export async function readPortfolio(sheets: sheets_v4.Sheets, id: string): Promise<Portfolio> {
  const present = new Set(await tabTitles(sheets, id));
  const tabs = APP_TABS.filter((t) => present.has(t));
  const res = tabs.length
    ? await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: tabs.map((t) => `${q(t)}!A2:Z`), valueRenderOption: 'UNFORMATTED_VALUE' })
    : null;
  const raw = Object.fromEntries(APP_TABS.map((t) => [t, [] as unknown[][]])) as Record<AppTab, unknown[][]>;
  tabs.forEach((t, i) => (raw[t] = (res?.data.valueRanges?.[i]?.values ?? []) as unknown[][]));
  return parsePortfolio(raw);
}

/**
 * Link a spreadsheet as the portfolio DB: create the missing app tabs (header + defaults/seed rows) and tag the file.
 * Existing tabs, the app's own included, are never cleared or rewritten.
 */
export async function linkPortfolio(g: Google, id: string): Promise<{ created: AppTab[]; migrated: boolean }> {
  const present = new Set(await tabTitles(g.sheets, id));
  const created = APP_TABS.filter((t) => !present.has(t));
  if (created.length) {
    await g.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: created.map((title) => ({ addSheet: { properties: { title } } })) } });
    await g.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: 'RAW', data: created.map((t) => ({ range: `${q(t)}!A1`, values: [HEADERS[t], ...defaultRowsFor(t)] })) },
    });
  }
  const migrated = !created.includes('Deposits') && !created.includes('Snapshots') && (await migrateSeedRows(g.sheets, id));
  // Only one file may carry the role, otherwise findByRole would pick one at random.
  const others = await listAll(g.drive, `appProperties has { key='${ROLE_KEY}' and value='portfolio' } and trashed=false`, 'id');
  for (const f of others) {
    if (f.id !== id) await g.drive.files.update({ fileId: f.id!, requestBody: { appProperties: { [ROLE_KEY]: null } as unknown as Record<string, string> } });
  }
  await g.drive.files.update({ fileId: id, requestBody: { appProperties: { [ROLE_KEY]: 'portfolio' } } });
  return { created, migrated };
}

/** Rewrite the seeded history (Deposits, Snapshots) when the seeds changed; other rows stay as they are. */
async function migrateSeedRows(sheets: sheets_v4.Sheets, id: string): Promise<boolean> {
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: [`${q('Deposits')}!A2:H`, `${q('Snapshots')}!A2:C`], valueRenderOption: 'UNFORMATTED_VALUE' });
  const [deposits, snapshots] = (res.data.valueRanges ?? []).map((r) => (r.values ?? []) as unknown[][]);
  const m = migrateSeeds(deposits ?? [], snapshots ?? []);
  if (!m.changed) return false;
  const pad = (rows: unknown[][], before: number, width: number) => [...rows, ...Array.from({ length: Math.max(0, before - rows.length) }, () => Array(width).fill(''))];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${q('Deposits')}!A2`, values: pad(m.deposits, deposits?.length ?? 0, HEADERS.Deposits.length) },
        { range: `${q('Snapshots')}!A2`, values: pad(m.snapshots, snapshots?.length ?? 0, HEADERS.Snapshots.length) },
      ],
    },
  });
  return true;
}

/** Append the import's new rows to the end of each tab's table. */
export async function appendImport(sheets: sheets_v4.Sheets, id: string, r: ImportResult): Promise<void> {
  const parts: [AppTab, Cell[][]][] = [
    ['Trades', r.trades.map(toRow.trades)],
    ['Deposits', r.deposits.map(toRow.deposits)],
    ['Dividends', r.dividends.map(toRow.dividends)],
    ['Symbols', r.newSymbols.map(toRow.symbols)],
  ];
  if (r.corrections?.length) {
    const keys = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${q('Trades')}!A:A` });
    const column = (keys.data.values ?? []).map((row) => String(row[0] ?? '').trim());
    const data = r.corrections.flatMap((t) => {
      const at = column.indexOf(t.key);
      return at > 0 ? [{ range: `${q('Trades')}!A${at + 1}`, values: [toRow.trades(t)] }] : [];
    });
    if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'RAW', data } });
  }
  for (const [t, rows] of parts) {
    if (!rows.length) continue;
    // INSERT_ROWS appends after the table, so a hand-added row (even one with a blank key) is never written over.
    await sheets.spreadsheets.values.append({ spreadsheetId: id, range: `${q(t)}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: rows } });
  }
}

/** Set one Plan key, keeping every other row (unknown keys included) as it is. */
export async function savePlanValue(sheets: sheets_v4.Sheets, id: string, key: keyof PlanSettings, value: string | number): Promise<void> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'Plan!A2:B', valueRenderOption: 'UNFORMATTED_VALUE' });
  const rows = (res.data.values ?? []) as Cell[][];
  const at = rows.findIndex((r) => String(r[0] ?? '').trim() === key);
  if (at >= 0) rows[at] = [key, value];
  else rows.push([key, value]);
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: 'Plan!A2', valueInputOption: 'RAW', requestBody: { values: rows } });
}

/** Send a slot's new money to its SRI symbol (and count that symbol in the slot). Old holdings stay put. */
export async function sriForNewBuys(sheets: sheets_v4.Sheets, id: string, slot: string): Promise<void> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'Slots!A2:G', valueRenderOption: 'UNFORMATTED_VALUE' });
  const rows = (res.data.values ?? []) as unknown[][];
  const at = rows.findIndex((r) => String(r[0] ?? '').trim() === slot);
  const s = at >= 0 ? fromRow.slots(rows[at]) : null;
  if (!s?.sriSymbol) return;
  const next = { ...s, buySymbol: s.sriSymbol, holdSymbols: s.holdSymbols.includes(s.sriSymbol) ? s.holdSymbols : [...s.holdSymbols, s.sriSymbol] };
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `Slots!A${at + 2}`, valueInputOption: 'RAW', requestBody: { values: [toRow.slots(next)] } });
}

export async function addCashRow(sheets: sheets_v4.Sheets, id: string, row: CashRow): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: 'Cash!A1', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [toRow.cash(row)] },
  });
}
