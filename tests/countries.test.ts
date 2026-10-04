import { describe, expect, it } from 'vitest';
import { detectCountry, isEU } from '@/lib/invoice/countries';

describe('detectCountry', () => {
  it('uses the address (last lines first), not the company name', () => {
    expect(
      detectCountry(['Poland - Japan Foundation', 'Tax ID (NIP): 5214079680', 'ul. Grzybowska 87', '00-844 Warsaw, Poland']),
    ).toBe('PL');
  });
  it('recognises cities, postal marks and VAT prefixes', () => {
    expect(detectCountry(['GALILEO GLOBAL EDUCATION 4', '8 rue des Pirogues de Bercy', 'FR7501.999908528', 'SIRET 99990852800014'])).toBe('FR');
    expect(detectCountry(['Steampunk Digital', '〒814-0001', 'Fukuoka-ken, Fukuoka-shi', '+81 80 3947 6874'])).toBe('JP');
    expect(detectCountry(['LE WAGON SPAIN, S.L', 'NIF ESB67094730', 'Calle de Hermosilla 48, 1D', '28001 Madrid, Spain'])).toBe('ES');
  });
  it('returns unknown when nothing matches', () => {
    expect(detectCountry(['Acme'])).toBe('unknown');
  });
});

describe('isEU', () => {
  it('knows EU members', () => {
    expect(isEU('FR')).toBe(true);
    expect(isEU('ES')).toBe(true);
    expect(isEU('JP')).toBe(false);
    expect(isEU('GB')).toBe(false);
  });
});
