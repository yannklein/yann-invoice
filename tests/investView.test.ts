import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS, SEED_DEPOSITS } from '@/lib/invest/defaults';
import type { PriceSeries } from '@/lib/invest/prices';
import type { Portfolio, Trade } from '@/lib/invest/types';
import { buildView, type InvestView } from '@/lib/invest/view';

const TODAY = '2026-10-17';
const series = (yahoo: string, close: number, currency = 'EUR'): PriceSeries => ({
  yahoo, currency, points: ['2026-10-13', '2026-10-14', '2026-10-15'].map((date) => ({ date, close, adj: close })),
});
const trade = (symbol: string, quantity: number, price: number): Trade => ({
  key: symbol, date: '2026-02-01', account: 'U1', symbol, isin: '', currency: 'EUR', quantity, price, commission: 0,
  amountEur: quantity * price, source: 'transfer', note: '',
});
const portfolio = (over: Partial<Portfolio> = {}): Portfolio => ({
  trades: [trade('IWRD', 10, 90), trade('IMEU', 10, 40), trade('CSBGE3', 10, 116)],
  deposits: [], dividends: [], cash: [], snapshots: [], plan: DEFAULT_PLAN,
  slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: DEFAULT_BENCHMARKS, invalidRows: 0, ...over,
});
const prices: Record<string, PriceSeries | null> = {
  'IWRD.AS': series('IWRD.AS', 93), 'IMEU.AS': series('IMEU.AS', 40), 'CSBGE3.SW': series('CSBGE3.SW', 116.3),
  '2B7K.DE': series('2B7K.DE', 14), 'IUSK.DE': series('IUSK.DE', 70),
};

const allFinite = (x: unknown): boolean =>
  typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(allFinite) : x && typeof x === 'object' ? Object.values(x).every(allFinite) : true;

describe('buildView: this round', () => {
  const v = buildView(portfolio(), prices, {}, TODAY, 1000);
  it('splits the requested amount over the slots', () => {
    expect(v.round.amountEur).toBe(1000);
    expect(v.round.lines.reduce((s, l) => s + l.buyEur, 0)).toBeCloseTo(1000, 1);
    expect(v.round.lines.map((l) => l.symbol)).toEqual(['IWRD', 'IMEU', 'CSBGE3']);
  });
  it('gives fractional units at the latest price', () => {
    for (const l of v.round.lines) {
      const q = v.quotes.find((x) => x.symbol === l.symbol)!;
      expect(l.units).toBe(Math.round((l.buyEur / q.priceEur) * 1e4) / 1e4);
    }
  });
  it('knows the next buy date and the value', () => {
    expect(v.nextBuy).toEqual({ date: '2027-01-01', days: 76 });
    expect(v.valueEur).toBeCloseTo(930 + 400 + 1163, 2);
  });
  it('defaults the amount to the plan plus uninvested cash', () => {
    const cash = { key: 'd', date: '2026-02-01', currency: 'EUR' as const, amount: 91, amountEur: 91, source: 'ibkr' as const, kind: 'internal' as const, note: '' };
    const w = buildView(portfolio({ deposits: [cash] }), prices, {}, TODAY, null);
    expect(w.round.amountEur).toBe(5091);
    expect(w.round.fromCashEur).toBe(91);
  });
});

describe('buildView: stale prices', () => {
  it('falls back to the last trade price and says so', () => {
    const v = buildView(portfolio(), { ...prices, 'IMEU.AS': null }, {}, TODAY, 1000);
    expect(v.quotes.find((q) => q.symbol === 'IMEU')).toMatchObject({ stale: true, priceEur: 40 });
    expect(v.missingSeries).toContain('IMEU.AS');
  });
  it('marks a quote older than five days as stale', () => {
    const old = { ...series('IWRD.AS', 93), points: [{ date: '2026-10-01', close: 93, adj: 93 }] };
    expect(buildView(portfolio(), { ...prices, 'IWRD.AS': old }, {}, TODAY, 1000).quotes.find((q) => q.symbol === 'IWRD')!.stale).toBe(true);
  });
});

describe('buildView: SRI path', () => {
  it('measures the SRI share and whether new money goes to SRI', () => {
    const slots = [{ ...DEFAULT_SLOTS[0], holdSymbols: ['IWRD', '2B7K'] }, ...DEFAULT_SLOTS.slice(1)];
    const p = portfolio({ slots, trades: [...portfolio().trades, trade('2B7K', 10, 14)] });
    const v = buildView(p, prices, {}, TODAY, 1000);
    expect(v.sriSharePct).toBeGreaterThan(0);
    expect(v.sri[0]).toMatchObject({ slot: 'World', usingSri: false });
    expect(v.sri[0].candidate?.symbol).toBe('2B7K');
    const using = buildView(portfolio({ slots: [{ ...slots[0], buySymbol: '2B7K' }, ...slots.slice(1)] }), prices, {}, TODAY, 1000);
    expect(using.sri[0].usingSri).toBe(true);
    expect(using.round.lines[0].symbol).toBe('2B7K');
  });
});

describe('buildView: legends', () => {
  it('runs every benchmark on the new-money flows', () => {
    const bench: Record<string, PriceSeries | null> = Object.fromEntries(DEFAULT_BENCHMARKS.map((b) => [b.yahoo, { ...series(b.yahoo, 10), points: [{ date: '2022-11-30', close: 10, adj: 10 }] }]));
    bench['BRK-B'] = { ...bench['BRK-B']!, currency: 'USD' };
    const v = buildView(portfolio({ deposits: SEED_DEPOSITS.map((d) => ({ ...d, kind: 'new' as const })) }), { ...prices, ...bench }, { '2022-11-30': { USD: 1.25 } }, TODAY, null);
    expect(v.legends.map((l) => l.name)).toEqual(['Hallam EU', 'Hallam SRI', 'Hallam all-in-one', 'Buffett 90/10', 'All-Weather', 'Permanent', 'All-in Berkshire']);
    const hallam = v.legends[0];
    expect(hallam.points[0].date).toBe('2022-12-01');
    expect(hallam.valueEur).toBeCloseTo(29970.38, 1); // flat prices: worth exactly what went in
    expect(v.investedEur).toBeCloseTo(29970.38, 1);
    expect(v.legends.at(-1)!.valueEur).toBeCloseTo(29970.38, 1); // USD converted at a flat rate
  });
});

describe('empty portfolio view', () => {
  it('renders without numbers going wrong', () => {
    const v: InvestView = buildView(portfolio({ trades: [] }), {}, null, TODAY, null);
    expect(v.valueEur).toBe(0);
    expect(v.you).toEqual([]);
    expect(v.legends.every((l) => l.points.length === 0 && l.valueEur === null)).toBe(true);
    expect(v.round.lines.every((l) => l.buyEur >= 0)).toBe(true);
    expect(allFinite(v)).toBe(true);
  });
});

describe('buildView: breakdown', () => {
  it('uses the same totals as the page stats', () => {
    const cash = { key: 'd', date: '2026-02-01', currency: 'EUR' as const, amount: 91, amountEur: 91, source: 'ibkr' as const, kind: 'internal' as const, note: '' };
    const v = buildView(portfolio({ deposits: [cash, ...SEED_DEPOSITS] }), prices, {}, TODAY, null);
    expect(v.breakdown.todayEur).toBe(v.valueEur);
    expect(v.breakdown.newMoneyEur).toBe(v.investedEur);
    const b = v.breakdown;
    expect(b.newMoneyEur + b.stockGainEur + b.dividendsEur + b.interestEur + b.currencyEur + b.earlierEur + b.otherEur).toBeCloseTo(b.todayEur, 2);
  });
});
