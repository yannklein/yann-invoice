import { describe, expect, it } from 'vitest';
import { NOTES, hasTaxId, taxRulesFor } from '@/lib/invoice/taxRules';
import { DEFAULT_SETTINGS } from '@/lib/invoice/types';

const base = { withholdingRate: 0, clientLines: ['Client', 'VAT: XX123456789'] };

describe('taxRulesFor', () => {
  it('Spain + teaching: IVA exempt, IRPF at the settings rate', () => {
    const t = taxRulesFor({ ...base, country: 'ES', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(t).toEqual({
      vatRate: 0, irpfRate: 0.07, withholdingRate: 0, warnings: [],
      notes: [
        '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.',
        '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales (primeros años de actividad).',
      ],
    });
  });

  it('Spain + other service: 21% IVA plus IRPF (general rate wording when not 7%)', () => {
    const t = taxRulesFor({ ...base, country: 'ES', serviceType: 'other' }, { ...DEFAULT_SETTINGS, irpfRate: 0.15 });
    expect(t.vatRate).toBe(0.21);
    expect(t.irpfRate).toBe(0.15);
    expect(t.notes).toEqual(['- Retención del IRPF del 15% conforme a la normativa vigente.']);
  });

  it('Spain with IRPF 0%: no IRPF note', () => {
    const t = taxRulesFor({ ...base, country: 'ES', serviceType: 'teaching' }, { ...DEFAULT_SETTINGS, irpfRate: 0 });
    expect(t.irpfRate).toBe(0);
    expect(t.notes).toEqual([NOTES.esExempt]);
    expect(taxRulesFor({ ...base, country: 'ES', serviceType: 'other' }, { ...DEFAULT_SETTINGS, irpfRate: 0 }).notes).toEqual([]);
  });

  it('EU (not Spain): reverse charge in EN + ES, warning without a VAT ID', () => {
    const ok = taxRulesFor({ ...base, country: 'FR', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(ok).toMatchObject({ vatRate: 0, irpfRate: 0, warnings: [] });
    expect(ok.notes).toEqual([NOTES.reverseChargeEn, NOTES.reverseChargeEs]);
    const missing = taxRulesFor({ ...base, clientLines: ['Some GmbH', 'Berlin'], country: 'DE', serviceType: 'other' }, DEFAULT_SETTINGS);
    expect(missing.warnings).toHaveLength(1);
  });

  it('outside the EU: not subject (Art. 69), per-client withholding passes through', () => {
    const t = taxRulesFor({ ...base, country: 'JP', serviceType: 'other', withholdingRate: 0.1021 }, DEFAULT_SETTINGS);
    expect(t).toEqual({ vatRate: 0, irpfRate: 0, withholdingRate: 0.1021, notes: [NOTES.notSubject], warnings: [] });
  });

  it('unknown country: no notes and a warning', () => {
    const t = taxRulesFor({ ...base, country: 'unknown', serviceType: 'teaching' }, DEFAULT_SETTINGS);
    expect(t.notes).toEqual([]);
    expect(t.warnings).toHaveLength(1);
  });
});

describe('hasTaxId', () => {
  it('recognises VAT/NIF/NIP lines and bare VAT numbers', () => {
    expect(hasTaxId(['LA LOCO SAS', 'VAT: FR20810930123'])).toBe(true);
    expect(hasTaxId(['PLJ', 'Tax ID (NIP): 5214079680'])).toBe(true);
    expect(hasTaxId(['GALILEO', 'FR7501.999908528'])).toBe(true);
    expect(hasTaxId(['Some GmbH', 'Berlin'])).toBe(false);
  });
});
