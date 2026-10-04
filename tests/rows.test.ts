import { describe, expect, it } from 'vitest';
import { diffFiles, mergeSync, metaFromAppProperties, rowToValues, settingsFromForm, settingsFromValues, settingsToValues, upsertRow, valuesToRow } from '@/lib/index/rows';
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

describe('mergeSync', () => {
  const file = (id: string, modifiedTime: string) => ({ id, name: id, modifiedTime, appProperties: {} });
  it('keeps the previous row of a file that could not be read, and counts it', () => {
    const prev = [row('a', 'm1'), row('b', 'old')];
    const out = mergeSync(prev, [prev[0]], [{ file: file('b', 'new'), row: null }, { file: file('c', 'm3'), row: null }]);
    expect(out.rows.map((r) => [r.fileId, r.modifiedTime])).toEqual(expect.arrayContaining([['a', 'm1'], ['b', 'old']]));
    expect(out.rows).toHaveLength(2);
    expect(out.failed).toEqual(['b', 'c']);
  });
  it('uses freshly parsed rows when reads succeed', () => {
    const out = mergeSync([row('a', 'old')], [], [{ file: file('a', 'new'), row: row('a', 'new') }]);
    expect(out.rows.map((r) => r.modifiedTime)).toEqual(['new']);
    expect(out.failed).toEqual([]);
  });
});

describe('upsertRow', () => {
  it('replaces a row with the same file id, or adds it', () => {
    expect(upsertRow([row('a', 'm1'), row('b', 'm2')], row('a', 'm9')).map((r) => [r.fileId, r.modifiedTime])).toEqual(
      expect.arrayContaining([['a', 'm9'], ['b', 'm2']]),
    );
    expect(upsertRow([row('a', 'm1')], row('c', 'm3'))).toHaveLength(2);
  });
});

describe('settingsFromForm', () => {
  it('converts a percent and rejects empty or out-of-range input', () => {
    expect(settingsFromForm('7', 'Due upon receipt')).toEqual({ irpfRate: 0.07, defaultTerms: 'Due upon receipt' });
    expect(settingsFromForm('15', ' Net 30 ')).toEqual({ irpfRate: 0.15, defaultTerms: 'Net 30' });
    expect(settingsFromForm('', 'x')).toBeNull();
    expect(settingsFromForm('-1', 'x')).toBeNull();
    expect(settingsFromForm('7', ' ')).toBeNull();
  });
});
