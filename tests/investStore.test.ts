import { describe, expect, it, vi } from 'vitest';
import type { sheets_v4 } from 'googleapis';
import { appendImport } from '@/lib/invest/store';
import type { ImportResult } from '@/lib/invest/importPlan';

describe('appendImport', () => {
  it('inserts rows after the table instead of writing over the first blank-key row', async () => {
    const append = vi.fn(async () => ({}));
    const batchUpdate = vi.fn(async () => ({}));
    const sheets = { spreadsheets: { values: { append, batchUpdate, batchGet: vi.fn(async () => ({ data: { valueRanges: [] } })) } } } as unknown as sheets_v4.Sheets;
    const trade = { key: 'k', date: '2026-02-04', account: 'U1', symbol: 'CSBGE3', isin: '', currency: 'EUR', quantity: 66, price: 116.23, commission: 0, amountEur: 7671.18, source: 'ibkr', note: '' };
    await appendImport(sheets, 'id', { trades: [trade], deposits: [], dividends: [], newSymbols: [] } as unknown as ImportResult);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ range: "'Trades'!A1", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }));
  });
});
