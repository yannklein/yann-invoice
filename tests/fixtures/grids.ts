type Col = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type Rows = Record<number, Partial<Record<Col, string>>>;

/** Build a 6-column grid from 1-based sparse rows. */
export function sparse(rows: Rows, height: number): string[][] {
  const g = Array.from({ length: height }, () => Array<string>(6).fill(''));
  for (const [r, cells] of Object.entries(rows)) {
    for (const [c, v] of Object.entries(cells)) g[Number(r) - 1]['ABCDEF'.indexOf(c)] = v ?? '';
  }
  return g;
}

const fill = (from: number, to: number, F: string): Rows =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { F }]));

const HEADER = { A: 'DESCRIPTION', D: 'QUANTITY', E: 'UNIT PRICE', F: 'AMOUNT' };

/** "Invoice Le Wagon Spain - 202609003" — Spain, teaching, IRPF 7%. Also the template source. */
export const ES_202609003 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202609003', E: 'Carrer de Sant Roc 35 BJ IN 2' },
  3: { E: 'Barcelona, 08014' },
  4: { E: 'SPAIN' },
  5: { E: 'Tax ID:', F: 'Z3059655Q' },
  6: { E: 'VAT ID:', F: 'ESZ3059655Q' },
  7: { A: 'Invoice For:', B: 'LE WAGON SPAIN, S.L' },
  8: { B: 'NIF ESB67094730', D: 'Issue Date', E: '2026/09/17' },
  9: { B: 'Calle de Hermosilla 48, 1D', D: 'Terms', E: 'Due 45 days after receipt' },
  10: { B: '28001 Madrid, Spain' },
  13: HEADER,
  14: { A: 'Talk during Open House event: Bootcamp content presentation as teacher - Sep 8 2026', D: '1.00', E: '€100.00', F: '€100.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€100.00' },
  24: { E: 'IRPF (7%)', F: '€7.00' },
  25: { A: 'IVA/VAT RATE', F: '0.00%' },
  26: { E: 'IVA/VAT', F: '€0.00' },
  27: { A: 'AMOUNT DUE', F: '€93.00' },
  29: { A: 'Notes' },
  30: { A: '- Operación exenta de IVA conforme al artículo 20.1.9º de la Ley 37/1992 del IVA.' },
  31: { A: '- Se aplica retención reducida del IRPF del 7% conforme a la normativa vigente para nuevos profesionales' },
  32: { A: '(primeros años de actividad).' },
  33: { A: '- Bank account details:' },
  34: { A: 'Name: YANN LUC KLEIN' },
  35: { A: 'Bank name: Caixabank' },
  36: { A: 'BIC/SWIFT Code : CAIXESBBXXX' },
  37: { A: 'IBAN: ES93 2100 0802 4807 0003 1447' },
}, 37);

/** "Invoice Matinno - June 2026 - 202606004" — Japan, ¥, 10.21% withholding, JP bank block. */
export const JP_MATINNO_202606004 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { E: 'Carrer de Sant Roc 35, bajos 2' },
  3: { E: '08014, SPAIN' },
  4: { E: '+33 7 59 69 64 81' },
  5: { A: 'Invoice no: 202606004', E: 'yann.klein@me.com' },
  6: { E: 'NIE: Z3059655Q' },
  7: { A: 'Invoice For:', B: 'New Normdesign. Inc' },
  8: { B: '〒103-0027', D: 'Issue Date', E: '2026/06/30' },
  9: { B: 'Tokyo , Nihonbashi, 3-1-3', D: 'Terms', E: 'Due upon receipt' },
  10: { B: '+81 80 4326 0935' },
  11: { B: 'Company no: 010401161343' },
  13: HEADER,
  14: { A: 'Development of Matinno application during the month', D: '1.00', E: '¥450,000', F: '¥450,000' },
  ...fill(16, 22, '¥0'),
  23: { A: 'SUBTOTAL', F: '¥450,000' },
  24: { E: 'VAT/IVA', F: '0.00%' },
  25: { A: 'WITHHOLDING TAX RATE', F: '10.21%' },
  26: { E: 'TAX', F: '¥45,945' },
  27: { A: 'TOTAL after withholding tax', F: '¥404,055' },
  29: { A: 'Notes' },
  30: { A: 'Operación no sujeta a IVA — Art. 69 Ley 37/1992' },
  31: { A: '- Bank account details:' },
  32: { A: '• 銀行名（Bank Name）: SMBC信託銀行 PRESTIA（エスエムビーシーシンタクギンコウ プレミア）' },
  33: { A: '• 金融機関コード（Bank Code）: 0300' },
  34: { A: '• 支店名（Branch Name）: 渋谷支店（シブヤ）' },
  35: { A: '• 支店コード（Branch Code）: 033' },
  36: { A: '• 口座種別（Account Type）: 普通預金（Futsuu – Regular Savings）' },
  37: { A: '• 口座番号（Account Number）: 1093731' },
  38: { A: '• 口座名義（Account Holder’s Name）: YANN LUC KLEIN（ヤン ルック クライン）' },
}, 38);

/** "Invoice LA LOCO SAS - Jan 2026 - 202601001" — France, reverse charge, Crédit Mutuel. */
export const FR_LALOCO_202601001 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202601001', E: 'Carrer de Sant Roc 35 BJ IN 2' },
  3: { E: 'Barcelona, 08014' },
  4: { E: 'SPAIN' },
  5: { E: 'Tax ID:', F: 'Z3059655Q' },
  7: { A: 'Invoice For:', B: 'LA LOCO SAS' },
  8: { B: 'VAT: FR20810930123', D: 'Issue Date', E: '2026/09/15' },
  9: { B: '24 rue Louis Blanc', D: 'Terms', E: 'Due upon receipt' },
  10: { B: 'PARIS 75010, FRANCE' },
  13: HEADER,
  14: { A: 'Content translation and presentation of the "Build an AI agent with n8n & Slack" remote workshop of January 13th 2026.', D: '1.00', E: '€250.00', F: '€250.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€250.00' },
  24: { A: 'VAT RATE', F: '0.00%' },
  25: { E: 'VAT', F: '€0.00' },
  26: { A: 'AMOUNT DUE', F: '€250.00' },
  28: { A: 'Notes' },
  29: { A: 'VAT reverse-charged – Article 196 EU VAT Directive' },
  30: { A: 'IVA 0% – Inversión del sujeto pasivo (Art. 196 Directiva 2006/112/CE)' },
  32: { A: '- Bank account details:' },
  33: { A: 'Name: YANN LUC KLEIN' },
  34: { A: 'Bank name: Credit Mutuel' },
  35: { A: 'BIC/SWIFT Code : CMCIFR2A' },
  36: { A: 'IBAN: FR76 1027 8054 5200 0741 0744 087' },
}, 36);

/**
 * "Invoice PLJ - 202608003" — Poland. A client cell with an embedded newline, an "IRPF" row at €0.00,
 * and a NIE sender line. Only rows 1–31 were readable, so there is NO bank section (a real-world gap the parser must tolerate).
 */
export const PL_PLJ_202608003 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { A: 'No. 202608003', E: 'Carrer de Sant Roc 35, BJ IN 2' },
  3: { E: '08014 Barcelona, SPAIN' },
  4: { E: 'NIE:', F: 'Z3059655Q' },
  5: { E: 'VAT ID:', F: 'ESZ3059655Q' },
  7: { A: 'Invoice For:', B: 'Poland - Japan Foundation' },
  8: { B: 'Tax ID (NIP): 5214079680\nKRS: 0001115824', D: 'Issue Date', E: '2026/09/13' },
  9: { B: 'ul. Grzybowska 87', D: 'Terms', E: 'Due 14 days after receipt' },
  10: { B: '00-844 Warsaw, Poland' },
  13: HEADER,
  14: { A: 'Second payment (50%), Service Agreement No. 06/2026, digital and mobile publication for the Poland–Japan Foundation.', D: '1.00', E: '€530.00', F: '€530.00' },
  ...fill(16, 22, '€0.00'),
  23: { A: 'SUBTOTAL', F: '€530.00' },
  24: { E: 'IRPF', F: '€0.00' },
  25: { A: 'IVA/VAT RATE', F: '0.00%' },
  26: { E: 'IVA/VAT', F: '€0.00' },
  27: { A: 'AMOUNT DUE', F: '€530.00' },
  29: { A: 'Notes' },
  30: { A: '- VAT reverse-charged – Article 196 EU VAT Directive' },
  31: { A: '- Amount invoiced in EUR. Payment in PLN per Section 4 of Service Agreement No. 06/2026.' },
}, 31);

/** "Invoice Steampunk Digital - CoffeeCam for iPhone" (2021) — no number anywhere, "TAX RATE ¥0". */
export const JP_STEAMPUNK_2021 = sparse({
  1: { A: 'INVOICE', D: 'From:', E: 'Yann Klein' },
  2: { E: '153-0065' },
  3: { E: 'Tokyo-to Meguro-ku Nakacho 1-8-25-201' },
  4: { E: 'JAPAN' },
  5: { E: '+81 90 1731 1845' },
  7: { A: 'Invoice For:', B: 'Steampunk Digital' },
  8: { B: '〒814-0001', D: 'Issue Date', E: '2021/08/26' },
  9: { B: 'Fukuoka-ken, Fukuoka-shi, Sawara-ku Momochihama, 3-Chome 8-33', D: 'Terms', E: 'Due upon receipt' },
  10: { B: '+81 80 3947 6874' },
  13: HEADER,
  14: { A: 'Development to adapt CoffeeCam for iPhone', D: '8.00', E: '¥7,000', F: '¥56,000' },
  ...fill(16, 22, '¥0'),
  23: { A: 'SUBTOTAL', F: '¥56,000' },
  24: { A: 'TAX RATE', F: '¥0' },
  25: { E: 'TAX' },
  26: { A: 'AMOUNT DUE', F: '¥56,000' },
  28: { A: 'Notes' },
  29: { A: '- Bank account details:' },
  30: { A: 'Name: クライン　ヤンルツク (Klein Yann Luc)' },
  31: { A: 'Bank name: 新生銀行 (Shinsei Bank)' },
  32: { A: 'Branch: 本店(400) (Head office)' },
  33: { A: 'BIC/SWIFT Code : LTCBJPJT' },
  34: { A: 'Account number: 2122024 ( フ Normal/Savings Account)' },
}, 34);
