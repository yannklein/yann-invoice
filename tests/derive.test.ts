import { describe, expect, it } from 'vitest';
import { bankLabel, clientKey, deriveBanks, deriveClients, effectiveServiceType, parseSort, sortNewest, sortRows, type IndexRow } from '@/lib/invoice/derive';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, FR_LALOCO_202601001, JP_MATINNO_202606004 } from './fixtures/grids';

const row = (fileId: string, grid: string[][], title: string, patch: Partial<IndexRow['invoice']> = {}, meta: IndexRow['meta'] = {}): IndexRow => ({
  fileId, title, modifiedTime: '2026-10-01T00:00:00.000Z', meta, invoice: { ...parseInvoice(grid, title), ...patch },
});

const es = row('es', ES_202609003, 'Invoice Le Wagon Spain - 202609003');
const esOld = row('es-old', ES_202609003, 'Invoice Le Wagon Spain - 202509001', { issueDate: '2025-09-01', number: '202509001', terms: 'Due upon receipt', clientName: 'Le Wagon Spain S.L.' });
const fr = row('fr', FR_LALOCO_202601001, 'Invoice LA LOCO SAS - Jan 2026 - 202601001');
const jp = row('jp', JP_MATINNO_202606004, 'Invoice Matinno - June 2026 - 202606004');

describe('clientKey', () => {
  it('ignores case and punctuation', () => {
    expect(clientKey('LE WAGON SPAIN, S.L')).toBe(clientKey('Le Wagon Spain S.L.'));
    expect(clientKey('株式会社テスト')).not.toBe('');
  });
});

describe('deriveClients', () => {
  it('keeps one profile per client, from the newest invoice', () => {
    const clients = deriveClients([esOld, es, fr, jp]);
    expect(clients.map((c) => c.name)).toEqual(['LA LOCO SAS', 'LE WAGON SPAIN, S.L', 'New Normdesign. Inc']);
    const lw = clients.find((c) => c.name === 'LE WAGON SPAIN, S.L')!;
    expect(lw).toMatchObject({ country: 'ES', terms: 'Due 45 days after receipt', serviceType: 'teaching', withholdingRate: 0, currency: 'EUR' });
    expect(lw.bankLines[1]).toBe('Bank name: Caixabank');
    expect(clients.find((c) => c.name === 'New Normdesign. Inc')!.withholdingRate).toBeCloseTo(0.1021);
  });
  it('prefers appProperties meta over guesses', () => {
    const tagged = row('t', JP_MATINNO_202606004, 'Invoice X - 202610001', { issueDate: '2026-10-02' }, { country: 'SG', serviceType: 'other' });
    expect(deriveClients([jp, tagged])[0]).toMatchObject({ country: 'SG', serviceType: 'other' });
  });
});

describe('effectiveServiceType', () => {
  it('Spanish invoice with IVA > 0 is "other", otherwise "teaching"', () => {
    expect(effectiveServiceType({ ...es, invoice: { ...es.invoice, vatRate: 0.21 } })).toBe('other');
    expect(effectiveServiceType(es)).toBe('teaching');
  });
});

describe('sortNewest', () => {
  it('sorts by issue date, then number, descending', () => {
    expect(sortNewest([esOld, jp, es]).map((r) => r.fileId)).toEqual(['es', 'jp', 'es-old']);
  });
});

describe('parseSort', () => {
  it('defaults to newest date first and rejects unknown values', () => {
    expect(parseSort()).toEqual({ key: 'date', dir: 'desc' });
    expect(parseSort('bogus', 'sideways')).toEqual({ key: 'date', dir: 'desc' });
    expect(parseSort('client')).toEqual({ key: 'client', dir: 'asc' });
    expect(parseSort('total', 'asc')).toEqual({ key: 'total', dir: 'asc' });
  });
});

describe('sortRows', () => {
  const ids = (rows: IndexRow[]) => rows.map((r) => r.fileId);
  const noNumber = row('none', ES_202609003, 'Draft', { number: null, total: null, clientName: '' });

  it('sorts each column both ways', () => {
    expect(ids(sortRows([esOld, jp, es], { key: 'date', dir: 'desc' }))).toEqual(['es', 'jp', 'es-old']);
    expect(ids(sortRows([esOld, jp, es], { key: 'date', dir: 'asc' }))).toEqual(['es-old', 'jp', 'es']);
    expect(ids(sortRows([es, jp, esOld], { key: 'number', dir: 'asc' }))).toEqual(['es-old', 'jp', 'es']);
    expect(ids(sortRows([es, fr, jp], { key: 'client', dir: 'asc' }))).toEqual(['fr', 'es', 'jp']);
    expect(ids(sortRows([es, fr, jp], { key: 'client', dir: 'desc' }))).toEqual(['jp', 'es', 'fr']);
  });

  it('groups totals by currency', () => {
    const big = row('big', ES_202609003, 'big', { total: 9999 });
    const small = row('small', ES_202609003, 'small', { total: 1 });
    const yen = row('yen', ES_202609003, 'yen', { total: 500000, currency: 'JPY' });
    expect(ids(sortRows([yen, small, big], { key: 'total', dir: 'desc' }))).toEqual(['big', 'small', 'yen']);
    expect(ids(sortRows([yen, big, small], { key: 'total', dir: 'asc' }))).toEqual(['small', 'big', 'yen']);
  });

  it('keeps missing values last in both directions', () => {
    for (const key of ['number', 'client', 'total'] as const) {
      expect(sortRows([noNumber, es], { key, dir: 'asc' }).at(-1)!.fileId).toBe('none');
      expect(sortRows([noNumber, es], { key, dir: 'desc' }).at(-1)!.fileId).toBe('none');
    }
  });
});

describe('banks', () => {
  it('labels banks with name and last 4 of the account', () => {
    expect(bankLabel(es.invoice.bankLines)).toBe('Caixabank ····1447');
    expect(bankLabel(jp.invoice.bankLines)).toBe('SMBC信託銀行 PRESTIA ····3731');
    expect(bankLabel(['Account number: 2122024 ( フ Normal/Savings Account)', 'Bank name: 新生銀行 (Shinsei Bank)'])).toBe('新生銀行 ····2024');
  });
  it('dedupes identical blocks, newest first', () => {
    const banks = deriveBanks([esOld, es, fr, jp]);
    expect(banks.map((b) => b.label)).toEqual(['Caixabank ····1447', 'Credit Mutuel ····4087', 'SMBC信託銀行 PRESTIA ····3731']);
  });
});
