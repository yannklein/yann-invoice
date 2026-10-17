/**
 * Where a fund is domiciled decides US estate-tax exposure for non-US people: US-domiciled shares and ETFs are US assets,
 * European UCITS funds (Irish IE…, Luxembourg LU…) are not, even when they hold US companies or trade in USD.
 */
const EUROPEAN = new Set(['IE', 'LU', 'DE', 'FR', 'NL', 'AT', 'BE', 'ES', 'IT', 'FI', 'PT', 'DK', 'SE', 'CH', 'GB', 'NO', 'LI', 'IS']);

export function domicileOf(isin: string): { country: string | null; eu: boolean } {
  const m = isin.trim().toUpperCase().match(/^([A-Z]{2})[A-Z0-9]{9}\d$/);
  if (!m) return { country: null, eu: false };
  return { country: m[1], eu: EUROPEAN.has(m[1]) };
}

const EXCHANGES: Record<string, string> = {
  DE: 'Xetra', F: 'Frankfurt', AS: 'Euronext Amsterdam', PA: 'Euronext Paris', BR: 'Euronext Brussels', MI: 'Borsa Italiana',
  SW: 'SIX Swiss Exchange', L: 'London Stock Exchange', MC: 'Bolsa de Madrid', VI: 'Vienna',
};

/** The exchange a Yahoo symbol trades on ("2B7K.DE" → Xetra); null for US listings and unknown suffixes. */
export function exchangeOf(yahoo: string): string | null {
  const suffix = yahoo.split('.')[1];
  return suffix ? EXCHANGES[suffix.toUpperCase()] ?? null : null;
}

export const justEtfUrl = (isin: string) => (isin.trim() ? `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin.trim())}` : null);
