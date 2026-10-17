import { describe, expect, it } from 'vitest';
import { SEED_DEPOSITS, SEED_SNAPSHOTS, migrateSeeds } from '@/lib/invest/defaults';
import { toRow } from '@/lib/invest/rows';

// What the first version seeded (and what the linked sheet holds today).
const oldDeposits = [
  ['sheet|dep|2022-12-01|JPY|1200000|0', '2022-12-01', 'JPY', 1200000, 8422.23, 'sheet', 'new', 'Rakuten (Japan tab) (ECB 142.48)'],
  ['sheet|dep|2023-07-01|JPY|1200000|0', '2023-07-01', 'JPY', 1200000, 7635.53, 'sheet', 'new', 'Rakuten (Japan tab) (ECB 157.16)'],
  ['sheet|dep|2024-01-01|JPY|1200000|0', '2024-01-01', 'JPY', 1200000, 7676.07, 'sheet', 'new', 'Rakuten (Japan tab) (ECB 156.33)'],
  ['sheet|dep|2025-01-01|JPY|1000000|0', '2025-01-01', 'JPY', 1000000, 6132.71, 'sheet', 'new', 'Rakuten (Japan tab) (ECB 163.06)'],
  ['sheet|dep|2025-07-01|JPY|750000|0', '2025-07-01', 'JPY', 750000, 4445.76, 'sheet', 'new', 'IBKR Japan, date inferred (ECB 168.7)'],
  ['U1|dep|2026-01-07|EUR|100|0', '2026-01-07', 'EUR', 100, 100, 'ibkr', 'internal', 'Electronic Fund Transfer'],
];
const oldSnapshots = [
  ['2022-12-01', 8422.23, 'a'], ['2023-07-01', 15888.33, 'b'], ['2024-01-01', 23228.73, 'c'], ['2025-01-01', 33592.74, '¥5,477,632 incl. UBS (Japan tab)'],
];

describe('migrateSeeds', () => {
  const m = migrateSeeds(oldDeposits, oldSnapshots);
  it('swaps the inferred deposits for the ones in the bank statements', () => {
    expect(m.changed).toBe(true);
    const sheet = m.deposits.filter((r) => r[5] === 'sheet');
    expect(sheet.map((r) => r[1])).toEqual(['2022-12-01', '2023-07-01', '2024-01-01', '2025-01-16', '2025-01-19', '2025-03-05', '2025-04-08', '2025-05-20', '2025-05-27']);
    expect(sheet.reduce((s, r) => s + Number(r[4]), 0)).toBeCloseTo(39019.9, 2);
    expect(m.deposits.find((r) => r[5] === 'ibkr')).toEqual(oldDeposits[5]);
  });
  it('re-dates the Jan 2025 snapshot to after that month\'s deposits', () => {
    expect(m.snapshots.map((r) => r[0])).toEqual(['2022-12-01', '2023-07-01', '2024-01-01', '2025-01-20']);
    expect(m.snapshots[3][1]).toBe(33946.65);
  });
  it('is idempotent and leaves hand-added rows alone', () => {
    const mine = ['sheet|dep|2025-08-01|JPY|1|0', '2025-08-01', 'JPY', 1, 0.01, 'sheet', 'new', 'mine'];
    const again = migrateSeeds([...m.deposits, mine], m.snapshots);
    expect(again.changed).toBe(false);
    expect(again.deposits).toContainEqual(mine);
  });
  it('matches what a fresh sheet is seeded with', () => {
    expect(SEED_DEPOSITS.map(toRow.deposits).map((r) => r.slice(0, 7))).toEqual(m.deposits.filter((r) => r[5] === 'sheet').map((r) => r.slice(0, 7)));
    expect(SEED_SNAPSHOTS.map(toRow.snapshots).map((r) => r.slice(0, 2))).toEqual(m.snapshots.map((r) => r.slice(0, 2)));
  });
});
