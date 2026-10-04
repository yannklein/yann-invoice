import { isEU } from './countries';
import type { ServiceType, Settings } from './types';

export const NOTES = {
  esExempt: '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.',
  reverseChargeEn: 'VAT reverse-charged – Article 196 EU VAT Directive',
  reverseChargeEs: 'IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)',
  notSubject: 'Operación no sujeta a IVA – Art. 69 Ley 37/1992 del IVA',
} as const;

const pct = (rate: number) => String(+(rate * 100).toFixed(2));

export function irpfNote(rate: number): string {
  if (Math.abs(rate - 0.07) < 1e-9) {
    return '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales (primeros años de actividad).';
  }
  return `- Retención del IRPF del ${pct(rate)}% conforme a la normativa vigente.`;
}

export function hasTaxId(lines: string[]): boolean {
  return lines.some(
    (l) => /\b(VAT|NIF|CIF|TVA|NIP|SIRET|USt-?IdNr)\b/i.test(l) || /^[A-Z]{2}[0-9A-Z]{2}[0-9A-Z.]{6,}$/.test(l.trim()),
  );
}

export interface TaxInput {
  country: string;
  serviceType: ServiceType;
  withholdingRate: number;
  clientLines: string[];
}

export interface TaxResult {
  vatRate: number;
  irpfRate: number;
  withholdingRate: number;
  notes: string[];
  warnings: string[];
}

export function taxRulesFor(input: TaxInput, settings: Settings): TaxResult {
  const { country, serviceType, withholdingRate } = input;
  const base = { withholdingRate, warnings: [] as string[] };

  if (country === 'ES') {
    const irpfRate = settings.irpfRate;
    const irpfNotes = irpfRate > 0 ? [irpfNote(irpfRate)] : [];
    return serviceType === 'teaching'
      ? { ...base, vatRate: 0, irpfRate, notes: [NOTES.esExempt, ...irpfNotes] }
      : { ...base, vatRate: 0.21, irpfRate, notes: irpfNotes };
  }
  if (isEU(country)) {
    const warnings = hasTaxId(input.clientLines) ? [] : ["EU reverse charge needs the client's VAT ID in the client details."];
    return { ...base, vatRate: 0, irpfRate: 0, notes: [NOTES.reverseChargeEn, NOTES.reverseChargeEs], warnings };
  }
  if (country === 'unknown' || !/^[A-Z]{2}$/.test(country)) {
    return { ...base, vatRate: 0, irpfRate: 0, notes: [], warnings: ['Pick the client country to get the legal notes.'] };
  }
  return { ...base, vatRate: 0, irpfRate: 0, notes: [NOTES.notSubject] };
}
