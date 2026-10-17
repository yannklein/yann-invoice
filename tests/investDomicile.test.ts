import { describe, expect, it } from 'vitest';
import { domicileOf, exchangeOf, justEtfUrl } from '@/lib/invest/domicile';

describe('domicileOf', () => {
  it('treats Irish and other European ISINs as EU funds', () => {
    expect(domicileOf('IE00B0M62Q58')).toEqual({ country: 'IE', eu: true });
    expect(domicileOf('LU0290358497')).toEqual({ country: 'LU', eu: true });
    expect(domicileOf('DE000A0S9GB0')).toEqual({ country: 'DE', eu: true });
  });
  it('flags US-domiciled and unknown ISINs', () => {
    expect(domicileOf('US0846707026')).toEqual({ country: 'US', eu: false });
    expect(domicileOf('')).toEqual({ country: null, eu: false });
    expect(domicileOf('nonsense')).toEqual({ country: null, eu: false });
  });
});

describe('exchangeOf', () => {
  it('names the exchange from the Yahoo suffix', () => {
    expect(exchangeOf('2B7K.DE')).toBe('Xetra');
    expect(exchangeOf('IWRD.AS')).toBe('Euronext Amsterdam');
    expect(exchangeOf('CSBGE3.SW')).toBe('SIX Swiss Exchange');
    expect(exchangeOf('BRK-B')).toBeNull();
  });
});

describe('justEtfUrl', () => {
  it('links the fund page by ISIN', () => {
    expect(justEtfUrl('IE00BYX2JD69')).toBe('https://www.justetf.com/en/etf-profile.html?isin=IE00BYX2JD69');
    expect(justEtfUrl('')).toBeNull();
  });
});
