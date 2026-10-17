import { describe, expect, it } from 'vitest';
import { SEED_DEPOSITS, migrateSeeds } from '@/lib/invest/defaults';
import { toRow } from '@/lib/invest/rows';

// The linked sheet as the previous version left it (2026-10-17).
const sheetRow = (date: string, jpy: number, eur: number, note: string) => [`sheet|dep|${date}|JPY|${jpy}|0`, date, 'JPY', jpy, eur, 'sheet', 'new', note];
const ibkrRow = (date: string, eur: number) => [`U1|dep|${date}|EUR|${eur}|0`, date, 'EUR', eur, eur, 'ibkr', 'internal', 'Electronic Fund Transfer'];
const tabs = {
  deposits: [
    sheetRow('2022-12-01', 1200000, 8422.23, 'Rakuten (Japan tab) (ECB 142.48)'),
    sheetRow('2023-07-01', 1200000, 7635.53, 'Rakuten (Japan tab) (ECB 157.16)'),
    sheetRow('2024-01-01', 1200000, 7676.07, 'Rakuten (Japan tab) (ECB 156.33)'),
    sheetRow('2025-01-16', 500000, 3116.04, 'Rakuten Securities, from SBI Shinsei (ECB 160.46)'),
    sheetRow('2025-01-19', 500000, 3120.51, 'Rakuten Securities, from SBI Shinsei (ECB 160.23)'),
    sheetRow('2025-03-05', 500000, 3123.24, 'IBKR Japan, from SBI Shinsei (ECB 160.09)'),
    sheetRow('2025-04-08', 500000, 3112.36, 'IBKR Japan, from SBI Shinsei (ECB 160.65)'),
    sheetRow('2025-05-20', 100000, 615.04, 'IBKR Japan, from SBI Shinsei (ECB 162.59)'),
    sheetRow('2025-05-27', 360000, 2198.88, 'IBKR Japan, from Yucho (ECB 163.72)'),
    ibkrRow('2026-01-07', 100),
    ibkrRow('2026-06-30', 2000),
  ],
  snapshots: [['2022-12-01', 8422.23, 'a'], ['2023-07-01', 15888.33, 'b'], ['2024-01-01', 23228.73, 'c'], ['2025-01-20', 33946.65, 'd']],
  cash: [['2026-07-05', 0, 4559.7, 'Livret Bleu, Rakuten money (internal)'], ['2026-10-17', 0, 3859.7, '']],
  plan: [['buyMonths', '1,7'], ['perBuyEur', 7750], ['internalBefore', '2026-07-06'], ['exactFrom', '2026-07-05']],
};

describe('migrateSeeds to the restart-at-IBKR model', () => {
  const m = migrateSeeds(tabs);
  it('keeps Rakuten as closed history and drops the IBKR Japan rows the statement replaces', () => {
    expect(m.changed).toBe(true);
    const sheet = m.deposits.filter((r) => r[5] === 'sheet');
    expect(sheet.map((r) => r[1])).toEqual(['2022-12-01', '2023-07-01', '2024-01-01', '2025-01-16', '2025-01-19']);
    expect(sheet.every((r) => r[6] === 'closed')).toBe(true);
  });
  it('counts IBKR deposits as money put in', () => {
    expect(m.deposits.filter((r) => r[5] === 'ibkr').map((r) => r[6])).toEqual(['new', 'new']);
  });
  it('makes the Livret Bleu opening money put in, and leaves later rows alone', () => {
    expect(m.cash).toEqual([['2026-07-05', 4559.7, 4559.7, 'Livret Bleu opening'], ['2026-10-17', 0, 3859.7, '']]);
  });
  it('drops the Rakuten-era snapshots and plan dates, keeping your own plan values', () => {
    expect(m.snapshots).toEqual([]);
    expect(m.plan).toEqual([['buyMonths', '1,7'], ['perBuyEur', 7750], ['internalBefore', ''], ['exactFrom', '']]);
  });
  it('is idempotent and keeps hand-added rows', () => {
    const mine = ['sheet|dep|2025-08-01|JPY|1|0', '2025-08-01', 'JPY', 1, 0.01, 'sheet', 'new', 'mine'];
    const again = migrateSeeds({ ...m, deposits: [...m.deposits, mine], snapshots: [['2026-01-01', 1, 'mine']] });
    expect(again.changed).toBe(false);
    expect(again.deposits).toContainEqual(mine);
  });
  it('matches a fresh sheet', () => {
    expect(SEED_DEPOSITS.map(toRow.deposits).map((r) => r.slice(0, 7))).toEqual(m.deposits.filter((r) => r[5] === 'sheet').map((r) => r.slice(0, 7)));
  });
});
