import { describe, expect, it } from 'vitest';
import { draftSchema, splitLines, toDraft, type DraftForm } from '@/lib/invoice/schema';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

const form = (patch: Partial<DraftForm> = {}): DraftForm => ({
  number: ' 202610001 ', issueDate: '2026-10-04', terms: 'Due upon receipt',
  clientLinesText: 'New Normdesign. Inc\n〒103-0027\n\n Tokyo , Nihonbashi, 3-1-3 ', country: 'JP', serviceType: 'other',
  currency: 'JPY', withholdingPercent: 10.21,
  items: [{ description: 'Development', quantity: 1, unitPrice: 450000 }],
  notesText: 'Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA\n- extra note', bankLinesText: '• line 1\n• line 2',
  ...patch,
});

describe('splitLines', () => {
  it('trims and drops empty lines', () => {
    expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });
});

describe('draftSchema', () => {
  it('accepts a valid form', () => {
    expect(draftSchema.safeParse(form()).success).toBe(true);
  });
  it('rejects missing country, empty client, 9 items, no bank', () => {
    expect(draftSchema.safeParse(form({ country: '' })).success).toBe(false);
    expect(draftSchema.safeParse(form({ clientLinesText: ' \n ' })).success).toBe(false);
    expect(draftSchema.safeParse(form({ items: Array(9).fill({ description: 'x', quantity: 1, unitPrice: 1 }) })).success).toBe(false);
    expect(draftSchema.safeParse(form({ bankLinesText: '' })).success).toBe(false);
  });
});

describe('toDraft', () => {
  it('applies tax rules, keeps edited notes, cleans lines and rates', () => {
    const d = toDraft(form(), DEFAULT_SETTINGS);
    expect(d).toMatchObject({
      number: '202610001', country: 'JP', serviceType: 'other', currency: 'JPY',
      clientLines: ['New Normdesign. Inc', '〒103-0027', 'Tokyo , Nihonbashi, 3-1-3'],
      vatRate: 0, irpfRate: 0, withholdingRate: 0.1021,
      notes: ['Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA', '- extra note'],
      bankLines: ['• line 1', '• line 2'],
    });
  });
  it('Spain + other gets 21% IVA and IRPF from settings', () => {
    const d = toDraft(form({ country: 'ES', serviceType: 'other', withholdingPercent: 0, currency: 'EUR' }), { ...DEFAULT_SETTINGS, irpfRate: 0.15 });
    expect(d).toMatchObject({ vatRate: 0.21, irpfRate: 0.15, withholdingRate: 0 });
  });
});
