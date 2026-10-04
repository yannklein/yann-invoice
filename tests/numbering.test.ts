import { describe, expect, it } from 'vitest';
import { isDuplicate, nextNumber } from '@/lib/invoice/numbering';

describe('nextNumber', () => {
  it('continues the counter of the issue month', () => {
    expect(nextNumber(['202609002', '202609003', '202609004', '202609005'], '2026-09-30')).toBe('202609006');
  });
  it('starts at 001 in a new month', () => {
    expect(nextNumber(['202609005'], '2026-10-01')).toBe('202610001');
    expect(nextNumber([], '2026-10-04')).toBe('202610001');
  });
  it('counts suffixed numbers by their counter and ignores junk', () => {
    expect(nextNumber(['202608001b', '202608003', null, 'SPECIAL-1', '2026080'], '2026-08-31')).toBe('202608004');
    expect(nextNumber(['202608001b'], '2026-08-02')).toBe('202608002');
  });
  it('uses the issue date month, not other months', () => {
    expect(nextNumber(['202609007', '202608002'], '2026-08-20')).toBe('202608003');
  });
});

describe('isDuplicate', () => {
  it('compares trimmed and case-insensitively', () => {
    expect(isDuplicate(['202609003'], ' 202609003 ')).toBe(true);
    expect(isDuplicate(['202608001B'], '202608001b')).toBe(true);
    expect(isDuplicate(['202609003', null], '202609004')).toBe(false);
    expect(isDuplicate([], '')).toBe(false);
  });
});
