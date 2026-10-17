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

describe('appendImport corrections', () => {
  it('rewrites a corrected row in place, found by its key', async () => {
    const append = vi.fn(async () => ({}));
    const batchUpdate = vi.fn(async () => ({}));
    const get = vi.fn(async () => ({ data: { values: [['key'], ['a'], ['xfer-imeu'], ['b']] } }));
    const sheets = { spreadsheets: { values: { append, batchUpdate, get } } } as unknown as sheets_v4.Sheets;
    const fixed = { key: 'xfer-imeu', date: '2026-01-27', account: 'U1', symbol: 'IMEU', isin: '', currency: 'EUR', quantity: 158.3901, price: 33.822621, commission: 0, amountEur: 5357.17, source: 'transfer', note: '' };
    await appendImport(sheets, 'id', { trades: [], deposits: [], dividends: [], newSymbols: [], corrections: [fixed] } as unknown as ImportResult);
    expect(append).not.toHaveBeenCalled();
    expect(batchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({ valueInputOption: 'RAW', data: [expect.objectContaining({ range: "'Trades'!A3" })] }),
    }));
  });
});
