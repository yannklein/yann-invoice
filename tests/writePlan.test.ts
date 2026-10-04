import { describe, expect, it } from 'vitest';
import { locate } from '@/lib/invoice/layout';
import { invoiceTitle, planFormats, planStructure, planValues } from '@/lib/invoice/writePlan';
import type { InvoiceDraft } from '@/lib/invoice/types';
import { ES_202609003 } from './fixtures/grids';

const SHEET = 7;
const draft = (patch: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  number: '202610001', issueDate: '2026-10-04', terms: 'Due 45 days after receipt',
  clientLines: ['LE WAGON SPAIN, S.L', 'NIF ESB67094730', 'Calle de Hermosilla 48, 1D', '28001 Madrid, Spain'],
  country: 'ES', serviceType: 'teaching', currency: 'EUR',
  items: [{ description: 'Teaching', quantity: 1, unitPrice: 100 }],
  vatRate: 0, irpfRate: 0.07, withholdingRate: 0,
  notes: ['- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.', '- Se aplica retención reducida…'],
  bankLines: ['Name: YANN LUC KLEIN', 'Bank name: Caixabank', 'BIC/SWIFT Code : CAIXESBBXXX', 'IBAN: ES93 2100 0802 4807 0003 1447'],
  ...patch,
});
const L = locate(ES_202609003);
const insert = (at: number, n: number) => ({ insertDimension: { range: { sheetId: SHEET, dimension: 'ROWS', startIndex: at, endIndex: at + n }, inheritFromBefore: true } });

describe('planStructure', () => {
  it('needs no structural change when the draft fits the template', () => {
    expect(planStructure(L, ES_202609003, draft(), SHEET)).toEqual([]);
  });

  it('adds withholding rows (copied from VAT rows) and removes IRPF, bottom-up', () => {
    const reqs = planStructure(L, ES_202609003, draft({ irpfRate: 0, withholdingRate: 0.1021 }), SHEET);
    expect(reqs[0]).toEqual(insert(26, 2));
    expect(reqs[1]).toMatchObject({ copyPaste: { source: { startRowIndex: 24, endRowIndex: 26 }, destination: { startRowIndex: 26, endRowIndex: 28 } } });
    expect(reqs[2]).toMatchObject({ updateCells: { start: { rowIndex: 26, columnIndex: 0 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'WITHHOLDING TAX RATE' } }] }] } });
    expect(reqs[3]).toMatchObject({ updateCells: { start: { rowIndex: 27, columnIndex: 4 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'WITHHOLDING' } }] }] } });
    expect(reqs[4]).toEqual({ deleteDimension: { range: { sheetId: SHEET, dimension: 'ROWS', startIndex: 23, endIndex: 24 } } });
  });

  it('inserts rows for long bank blocks, notes and client details instead of overwriting headers', () => {
    const reqs = planStructure(L, ES_202609003, draft({
      bankLines: Array.from({ length: 8 }, (_, i) => `bank ${i}`),
      notes: ['1', '2', '3', '4', '5'],
      clientLines: ['a', 'b', 'c', 'd', 'e', 'f'],
    }), SHEET);
    expect(reqs).toEqual([insert(37, 4), insert(32, 2), insert(11, 1)]);
  });

  it('refuses a template without the IRPF row when IRPF is needed', () => {
    const noIrpf = ES_202609003.map((r, i) => (i === 23 ? ['', '', '', '', '', ''] : r));
    expect(() => planStructure(locate(noIrpf), noIrpf, draft(), SHEET)).toThrow(/IRPF/);
  });
});

describe('planValues', () => {
  const find = (list: { range: string; values: (string | number)[][] }[], range: string) => list.find((v) => v.range === range)?.values;

  it('writes text RAW and numbers/formulas USER_ENTERED at the located cells', () => {
    const { raw, entered } = planValues(L, ES_202609003, draft());
    expect(find(raw, 'A2')).toEqual([['No. 202610001']]);
    expect(find(raw, 'B7:B11')).toEqual([['LE WAGON SPAIN, S.L'], ['NIF ESB67094730'], ['Calle de Hermosilla 48, 1D'], ['28001 Madrid, Spain'], ['']]);
    expect(find(raw, 'E8')).toEqual([['2026/10/04']]);
    expect(find(raw, 'A14:A22')?.[0]).toEqual(['Teaching']);
    expect(find(entered, 'D14:F22')?.slice(0, 2)).toEqual([[1, 100, '=D14*E14'], ['', '', '']]);
    expect(find(entered, 'F23')).toEqual([['=SUM(F14:F22)']]);
    expect(find(raw, 'E24')).toEqual([['IRPF (7%)']]);
    expect(find(entered, 'F24')).toEqual([['=ROUND(F23*0.07,2)']]);
    expect(find(entered, 'F25')).toEqual([[0]]);
    expect(find(entered, 'F26')).toEqual([['=ROUND(F23*F25,2)']]);
    expect(find(raw, 'A27')).toEqual([['AMOUNT DUE']]);
    expect(find(entered, 'F27')).toEqual([['=F23+F26-F24']]);
    expect(find(raw, 'A30:A32')?.[0][0]).toMatch(/^- Operación/);
    expect(find(raw, 'A34:A37')?.[3]).toEqual(['IBAN: ES93 2100 0802 4807 0003 1447']);
  });

  it('never sends dash-prefixed text through USER_ENTERED', () => {
    const { entered } = planValues(L, ES_202609003, draft());
    const strings = entered.flatMap((v) => v.values.flat()).filter((x): x is string => typeof x === 'string');
    expect(strings.every((s) => s === '' || s.startsWith('='))).toBe(true);
  });

  it('uses 0 decimals for JPY', () => {
    const { entered } = planValues(L, ES_202609003, draft({ currency: 'JPY' }));
    expect(find(entered, 'F24')).toEqual([['=ROUND(F23*0.07,0)']]);
  });

  it('fills withholding rows after structure added them', () => {
    const grown = [...ES_202609003.slice(0, 26), ['WITHHOLDING TAX RATE', '', '', '', '', ''], ['', '', '', '', 'WITHHOLDING', ''], ...ES_202609003.slice(26)];
    const { raw, entered } = planValues(locate(grown), grown, draft({ withholdingRate: 0.1021 }));
    expect(find(entered, 'F27')).toEqual([[0.1021]]);
    expect(find(entered, 'F28')).toEqual([['=ROUND(F23*F27,2)']]);
    expect(find(raw, 'A29')).toEqual([['TOTAL after withholding tax']]);
    expect(find(entered, 'F29')).toEqual([['=F23+F26-F24-F28']]);
  });

  it('rejects more items than the template holds', () => {
    const items = Array.from({ length: 10 }, () => ({ description: 'x', quantity: 1, unitPrice: 1 }));
    expect(() => planValues(L, ES_202609003, draft({ items }))).toThrow(/items/);
  });
});

describe('planFormats', () => {
  it('applies the currency pattern to money cells and percent to rates', () => {
    const reqs = planFormats(L, draft({ currency: 'JPY' }), SHEET);
    const formats = reqs.map((r) => r.repeatCell!.cell!.userEnteredFormat!.numberFormat!);
    expect(formats.filter((f) => f.type === 'CURRENCY').every((f) => f.pattern === '"¥"#,##0')).toBe(true);
    expect(formats.filter((f) => f.type === 'PERCENT')).toHaveLength(1);
  });
});

describe('invoiceTitle', () => {
  it('follows the historical naming', () => {
    expect(invoiceTitle(draft())).toBe('Invoice LE WAGON SPAIN, S.L - Oct 2026 - 202610001');
  });
});
