import { describe, expect, it } from 'vitest';
import { locate } from '@/lib/invoice/layout';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, JP_MATINNO_202606004, FR_LALOCO_202601001, PL_PLJ_202608003, JP_STEAMPUNK_2021 } from './fixtures/grids';

describe('locate', () => {
  it('finds every labelled row of the template (0-based)', () => {
    expect(locate(ES_202609003)).toEqual({
      fromRow: 0, numberRow: 1, clientRow: 6, issueDateRow: 7, termsRow: 8, descriptionRow: 12,
      subtotalRow: 22, irpfRow: 23, vatRateRow: 24, vatAmountRow: 25, whtRateRow: null, whtAmountRow: null,
      totalRow: 26, notesRow: 28, bankRow: 32,
    });
  });
  it('handles the Matinno variant (VAT/IVA rate in column E, withholding rows)', () => {
    const L = locate(JP_MATINNO_202606004);
    expect(L.numberRow).toBe(4);
    expect(L.vatRateRow).toBe(23);
    expect(L.vatAmountRow).toBeNull();
    expect(L.whtRateRow).toBe(24);
    expect(L.whtAmountRow).toBe(25);
    expect(L.totalRow).toBe(26);
    expect(L.irpfRow).toBeNull();
  });
});

describe('parseInvoice', () => {
  it('parses a Spanish teaching invoice', () => {
    const inv = parseInvoice(ES_202609003, 'Invoice Le Wagon Spain - 202609003');
    expect(inv).toMatchObject({
      number: '202609003', issueDate: '2026-09-17', terms: 'Due 45 days after receipt',
      clientName: 'LE WAGON SPAIN, S.L', country: 'ES', currency: 'EUR',
      subtotal: 100, irpfRate: 0.07, vatRate: 0, withholdingRate: 0, total: 93,
    });
    expect(inv.items).toEqual([{ description: 'Talk during Open House event: Bootcamp content presentation as teacher - Sep 8 2026', quantity: 1, unitPrice: 100 }]);
    expect(inv.clientLines).toHaveLength(4);
    expect(inv.senderLines).toContain('Tax ID: Z3059655Q');
    expect(inv.notes).toHaveLength(3);
    expect(inv.notes[0]).toMatch(/^- Operación exenta/);
    expect(inv.bankLines).toEqual(['Name: YANN LUC KLEIN', 'Bank name: Caixabank', 'BIC/SWIFT Code : CAIXESBBXXX', 'IBAN: ES93 2100 0802 4807 0003 1447']);
  });

  it('parses a Japanese invoice with withholding', () => {
    const inv = parseInvoice(JP_MATINNO_202606004, 'Invoice Matinno - June 2026 - 202606004');
    expect(inv).toMatchObject({ number: '202606004', country: 'JP', currency: 'JPY', subtotal: 450000, vatRate: 0, irpfRate: 0, total: 404055, clientName: 'New Normdesign. Inc' });
    expect(inv.withholdingRate).toBeCloseTo(0.1021, 6);
    expect(inv.notes).toEqual(['Operación no sujeta a IVA — Art. 69 Ley 37/1992']);
    expect(inv.bankLines).toHaveLength(7);
  });

  it('parses a French reverse-charge invoice', () => {
    const inv = parseInvoice(FR_LALOCO_202601001, 'Invoice LA LOCO SAS - Jan 2026 - 202601001');
    expect(inv).toMatchObject({ number: '202601001', country: 'FR', issueDate: '2026-09-15', total: 250 });
    expect(inv.notes).toHaveLength(2);
    expect(inv.bankLines[1]).toBe('Bank name: Credit Mutuel');
  });

  it('splits multi-line cells, detects Poland despite "Japan" in the name, tolerates a missing bank section', () => {
    const inv = parseInvoice(PL_PLJ_202608003, 'Invoice PLJ - 202608003');
    expect(inv.country).toBe('PL');
    expect(inv.clientLines).toEqual(['Poland - Japan Foundation', 'Tax ID (NIP): 5214079680', 'KRS: 0001115824', 'ul. Grzybowska 87', '00-844 Warsaw, Poland']);
    expect(inv.senderLines).toContain('NIE: Z3059655Q');
    expect(inv.irpfRate).toBe(0);
    expect(inv.bankLines).toEqual([]);
    expect(inv.notes).toHaveLength(2);
  });

  it('parses a 2021 legacy invoice with no number', () => {
    const inv = parseInvoice(JP_STEAMPUNK_2021, 'Invoice Steampunk Digital - CoffeeCam for iPhone');
    expect(inv).toMatchObject({ number: null, country: 'JP', currency: 'JPY', vatRate: 0, total: 56000, clientName: 'Steampunk Digital', issueDate: '2021-08-26' });
    expect(inv.items[0]).toEqual({ description: 'Development to adapt CoffeeCam for iPhone', quantity: 8, unitPrice: 7000 });
    expect(inv.notes).toEqual([]);
    expect(inv.bankLines).toHaveLength(5);
  });

  it('falls back to the number at the end of the file title', () => {
    expect(parseInvoice(JP_STEAMPUNK_2021, 'Invoice Le Wagon Spain - Aug 2026 - 202608001b').number).toBe('202608001b');
  });

  it('survives an empty sheet', () => {
    const inv = parseInvoice([], 'Invoice Something');
    expect(inv).toMatchObject({ number: null, clientName: 'Something', items: [], total: null, country: 'unknown', currency: 'EUR' });
  });
});
