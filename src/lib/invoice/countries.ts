export const COUNTRIES: Record<string, string> = {
  AT: 'Austria', AU: 'Australia', BE: 'Belgium', BG: 'Bulgaria', CA: 'Canada', CH: 'Switzerland',
  CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', ES: 'Spain',
  FI: 'Finland', FR: 'France', GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia', HU: 'Hungary',
  IE: 'Ireland', IT: 'Italy', JP: 'Japan', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia',
  MT: 'Malta', NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden',
  SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', US: 'United States',
};

const EU = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export const isEU = (code: string) => EU.has(code);

const EXTRA: [string, RegExp][] = [
  ['JP', /tokyo|osaka|fukuoka|〒|日本/i],
  ['ES', /españa|madrid|barcelona/i],
  ['FR', /paris|\bFR\d/i],
  ['PL', /polska|warsaw|warszawa/i],
  ['AU', /melbourne|sydney/i],
  ['DE', /deutschland|berlin/i],
  ['GB', /\bUK\b|london/i],
  ['US', /\bUSA\b/i],
];

const PATTERNS: [string, RegExp][] = [
  ...Object.entries(COUNTRIES).map(([code, name]): [string, RegExp] => [code, new RegExp(`\\b${name}\\b`, 'i')]),
  ...EXTRA,
];

/** Address lines are checked from the bottom up, so a company *name* never wins over the address. */
export function detectCountry(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const [code, re] of PATTERNS) if (re.test(lines[i])) return code;
  }
  return 'unknown';
}
