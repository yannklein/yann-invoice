import { describe, expect, it } from 'vitest';
import { badges, lazyStreak, quips, scoreboardQuip, type QuipContext } from '@/lib/invest/quips';

const ctx: QuipContext = {
  today: '2027-01-05', youValue: 42654, invested: 34312, lastTradeDate: '2026-07-06', driftPts: [1, -1.5, 0.5],
  boughtInDrawdown: false, projection40: 1_180_000, buffettAgeValue: 4_100_000, buffettAge: 55,
  legends: [{ name: 'Buffett 90/10', value: 43000 }, { name: 'Permanent', value: 39000 }],
};

describe('lazyStreak', () => {
  it('counts days since the last trade', () => expect(lazyStreak('2027-01-05', '2026-07-06')).toBe(183));
  it('is null without trades', () => expect(lazyStreak('2027-01-05', null)).toBeNull());
});

describe('badges', () => {
  const earned = (c: QuipContext) => Object.fromEntries(badges(c).map((b) => [b.id, b.earned]));
  it('always returns the four badges in order', () => expect(badges(ctx).map((b) => b.id)).toEqual(['sloth', 'bullseye', 'diamond', 'compound']));
  it('earns them from the thresholds', () => {
    expect(earned(ctx)).toEqual({ sloth: true, bullseye: true, diamond: false, compound: true });
    expect(earned({ ...ctx, today: '2026-10-14', driftPts: [3], boughtInDrawdown: true, projection40: 999_999 }))
      .toEqual({ sloth: false, bullseye: false, diamond: true, compound: false });
  });
});

describe('quips', () => {
  it('gives 2 to 4 clean lines, stable for a day', () => {
    const q = quips(ctx);
    expect(q.length).toBeGreaterThanOrEqual(2);
    expect(q.length).toBeLessThanOrEqual(4);
    expect(quips(ctx)).toEqual(q);
    for (const line of q) expect(line).not.toMatch(/NaN|undefined|null/);
  });
  it('rotates across days', () => {
    const days = Array.from({ length: 10 }, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`);
    expect(new Set(days.map((today) => quips({ ...ctx, today }).join('|'))).size).toBeGreaterThan(1);
  });
  it("skips the Buffett's age line without a birth year", () => {
    const days = Array.from({ length: 20 }, (_, i) => `2027-02-${String(i + 1).padStart(2, '0')}`);
    for (const today of days) for (const line of quips({ ...ctx, today, buffettAgeValue: null, buffettAge: null })) expect(line).not.toContain("Buffett's age");
  });
  it('works for an empty portfolio', () => {
    const q = quips({ ...ctx, youValue: 0, invested: 0, lastTradeDate: null, legends: [], driftPts: [], projection40: 0, buffettAgeValue: null, buffettAge: null });
    expect(q.length).toBeGreaterThanOrEqual(2);
    for (const line of q) expect(line).not.toMatch(/NaN|undefined|null|Infinity/);
  });
});

describe('scoreboardQuip', () => {
  it('prices a legend lead in Cherry Cokes', () => {
    const s = scoreboardQuip('Buffett 90/10', 312);
    expect(s).toContain('€312');
    expect(s).toContain('260');
  });
  it('uses a different line when you are ahead', () => {
    expect(scoreboardQuip('Buffett 90/10', -312)).not.toEqual(scoreboardQuip('Buffett 90/10', 312));
    expect(scoreboardQuip('Buffett 90/10', -312)).toContain('€312');
  });
});
