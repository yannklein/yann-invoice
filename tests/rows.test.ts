import { describe, expect, it } from 'vitest';
import { diffFiles, metaFromAppProperties, rowToValues, settingsFromValues, settingsToValues, valuesToRow } from '@/lib/index/rows';
import { parseInvoice } from '@/lib/invoice/parse';
import type { IndexRow } from '@/lib/invoice/derive';
import { ES_202609003 } from './fixtures/grids';

const row = (fileId: string, modifiedTime: string): IndexRow => ({ fileId, title: 't', modifiedTime, meta: { country: 'ES' }, invoice: parseInvoice(ES_202609003, 't') });

describe('index rows', () => {
  it('round-trips through sheet values', () => {
    const r = row('a', 'm1');
    expect(valuesToRow(rowToValues(r).map(String))).toEqual(r);
  });
  it('drops rows with broken JSON instead of crashing', () => {
    expect(valuesToRow(['a', 't', 'm', '', '', '', '', '', '{}', 'not json'])).toBeNull();
  });
});

describe('settings values', () => {
  it('parses with defaults', () => {
    expect(settingsFromValues([['irpfRate', '0.15'], ['defaultTerms', 'Net 30']])).toEqual({ irpfRate: 0.15, defaultTerms: 'Net 30' });
    expect(settingsFromValues([['irpfRate', '']])).toEqual({ irpfRate: 0.07, defaultTerms: 'Due upon receipt' });
    expect(settingsFromValues(settingsToValues({ irpfRate: 0.07, defaultTerms: 'X' }))).toEqual({ irpfRate: 0.07, defaultTerms: 'X' });
  });
});

describe('metaFromAppProperties', () => {
  it('keeps only known keys', () => {
    expect(metaFromAppProperties({ country: 'JP', serviceType: 'other', yannInvoiceRole: 'invoice' })).toEqual({ country: 'JP', serviceType: 'other' });
    expect(metaFromAppProperties({ serviceType: 'bogus' })).toEqual({});
    expect(metaFromAppProperties(undefined)).toEqual({});
  });
});

describe('diffFiles', () => {
  const files = [
    { id: 'a', name: 'A', modifiedTime: 'm1', appProperties: {} },
    { id: 'b', name: 'B', modifiedTime: 'm2', appProperties: {} },
    { id: 'c', name: 'C', modifiedTime: 'm3', appProperties: {} },
  ];
  it('re-parses new and modified files, drops deleted ones', () => {
    const d = diffFiles(files, [row('a', 'm1'), row('b', 'old'), row('d', 'm4')], false);
    expect(d.toParse.map((f) => f.id)).toEqual(['b', 'c']);
    expect(d.kept.map((r) => r.fileId)).toEqual(['a']);
    expect(d.changed).toBe(true);
  });
  it('reports no change when everything matches', () => {
    expect(diffFiles(files.slice(0, 1), [row('a', 'm1')], false)).toMatchObject({ toParse: [], changed: false });
  });
  it('full mode re-parses everything', () => {
    expect(diffFiles(files, [row('a', 'm1')], true).toParse).toHaveLength(3);
  });
});
