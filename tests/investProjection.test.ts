import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOTS } from '@/lib/invest/defaults';
import { blendedReturn, buffettHorizon, project } from '@/lib/invest/projection';

describe('blendedReturn', () => {
  it('weights stock and bond returns by target', () => expect(blendedReturn(DEFAULT_SLOTS, 0.05, 0.01)).toBeCloseTo(0.04, 10));
});

describe('project', () => {
  const base = { startEur: 0, perBuyEur: 1000, buysPerYear: 1, realReturn: 0 };
  it('adds contributions without growth', () => expect(project(base, [10])).toEqual([{ years: 10, valueEur: 10000 }]));
  it('compounds the start and yearly contributions', () => expect(project({ ...base, startEur: 10000, realReturn: 0.04 }, [10])[0].valueEur).toBe(26809));
  it('compounds per buy period', () => expect(project({ ...base, buysPerYear: 2, realReturn: 0.04 }, [10])[0].valueEur).toBe(24250));
  it('treats zero buys per year as one', () => expect(project({ ...base, buysPerYear: 0 }, [10])[0].valueEur).toBe(10000));
  it('returns each requested horizon', () => expect(project(base, [10, 20, 30, 40]).map((p) => p.valueEur)).toEqual([10000, 20000, 30000, 40000]));
});

describe('buffettHorizon', () => {
  it('years until Buffett age 96', () => expect(buffettHorizon(1985, '2026-10-17')).toBe(55));
  it('null without a birth year or once past 96', () => {
    expect(buffettHorizon(null, '2026-10-17')).toBeNull();
    expect(buffettHorizon(1925, '2026-10-17')).toBeNull();
  });
});
