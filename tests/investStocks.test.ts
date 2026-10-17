import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCHMARKS, DEFAULT_PLAN, DEFAULT_SLOTS, DEFAULT_SYMBOLS } from '@/lib/invest/defaults';
import { costBasis, stockSummary } from '@/lib/invest/stocks';
import type { Dividend, Portfolio, Trade } from '@/lib/invest/types';
import type { Quote } from '@/lib/invest/view';

const trade = (symbol: string, date: string, quantity: number, amountEur: number, source: Trade['source'] = 'ibkr'): Trade => ({
  key: `${symbol}|${date}|${quantity}`, date, account: 'U1', symbol, isin: '', currency: 'EUR', quantity,
  price: Math.abs(amountEur / quantity), commission: 0, amountEur, source, note: '',
});
const dividend = (symbol: string, amountEur: number): Dividend => ({ key: symbol, date: '2026-03-01', symbol, currency: 'EUR', amount: amountEur, amountEur });
const quote = (symbol: string, priceEur: number, date = '2026-10-16', stale = false): Quote => ({ symbol, priceEur, date, stale });

// The real Stock mix holdings on 2026-10-17.
const portfolio = (over: Partial<Portfolio> = {}): Portfolio => ({
  trades: [
    trade('IMEU', '2026-01-27', 158.3901, 5988.73, 'transfer'),
    trade('IWRD', '2026-01-27', 198.6907, 16144.41, 'transfer'),
    trade('CSBGE3', '2026-02-04', 66, 7675.02),
    trade('IWRD', '2026-07-06', 57.4462, 5201.99),
  ],
  deposits: [], dividends: [dividend('IMEU', 135.88), dividend('IWRD', 131.97)],
  cash: [{ date: '2026-07-05', deposit: 0, balance: 4559.7, note: 'Livret Bleu' }], snapshots: [],
  plan: DEFAULT_PLAN, slots: DEFAULT_SLOTS, symbols: DEFAULT_SYMBOLS, benchmarks: DEFAULT_BENCHMARKS, invalidRows: 0, ...over,
});
const quotes = [quote('IWRD', 93.47), quote('IMEU', 40.205), quote('CSBGE3', 109.58)];

describe('costBasis', () => {
  it('adds what was paid for each buy, transfers in at their value on the day', () => {
    expect(costBasis(portfolio().trades)).toEqual({ IMEU: 5988.73, IWRD: 21346.4, CSBGE3: 7675.02 });
  });

  it('takes sold shares out at their average cost, whatever they sold for', () => {
    const trades = [trade('IWRD', '2026-01-01', 10, 900), trade('IWRD', '2026-02-01', 10, 1100), trade('IWRD', '2026-03-01', -5, -700)];
    expect(costBasis(trades)).toEqual({ IWRD: 1500 });
  });

  it('applies trades in date order and drops closed positions', () => {
    const trades = [trade('IMEU', '2026-03-01', -4, -200), trade('IMEU', '2026-01-01', 4, 160), trade('IWRD', '2026-01-01', 1, 90)];
    expect(costBasis(trades)).toEqual({ IWRD: 90 });
  });
});

describe('stockSummary', () => {
  const s = stockSummary(portfolio(), quotes);

  it('values only the funds held, ignoring IBKR cash and the Livret Bleu', () => {
    expect(s.valueEur).toBeCloseTo(37541.47, 1);
    expect(s.investedEur).toBe(35010.15);
    expect(s.gainEur).toBeCloseTo(2531.32, 1);
    expect(s.gainPct).toBeCloseTo(7.23, 1);
  });

  it('lists each fund, biggest first, with its own gain and share of the total', () => {
    expect(s.lines.map((l) => l.symbol)).toEqual(['IWRD', 'CSBGE3', 'IMEU']);
    expect(s.lines[0]).toMatchObject({ name: 'iShares MSCI World (Dist)', investedEur: 21346.4 });
    expect(s.lines[0].gainEur).toBeCloseTo(2594.72, 1);
    expect(s.lines[1].gainPct).toBeCloseTo(-5.77, 1);
    expect(s.lines.reduce((a, l) => a + l.sharePct, 0)).toBeCloseTo(100, 5);
  });

  it('reports dividends separately from the gain', () => {
    expect(s.dividendsEur).toBe(267.85);
  });

  it('dates the prices by the oldest quote and flags any stale one', () => {
    const t = stockSummary(portfolio(), [quote('IWRD', 93.47), quote('IMEU', 40.205, '2026-10-01', true), quote('CSBGE3', 109.58)]);
    expect(t.priceDate).toBe('2026-10-01');
    expect(t.stale).toBe(true);
    expect(t.lines.find((l) => l.symbol === 'IMEU')!.stale).toBe(true);
    expect(s.stale).toBe(false);
  });

  it('values a fund without a quote at what was paid, marked stale', () => {
    const t = stockSummary(portfolio(), quotes.filter((q) => q.symbol !== 'IMEU'));
    expect(t.lines.find((l) => l.symbol === 'IMEU')).toMatchObject({ valueEur: 5988.73, gainEur: 0, stale: true });
  });

  it('is all zeros for an empty portfolio', () => {
    expect(stockSummary(portfolio({ trades: [], dividends: [] }), [])).toEqual({
      valueEur: 0, investedEur: 0, gainEur: 0, gainPct: null, dividendsEur: 0, priceDate: null, stale: false, lines: [],
    });
  });
});
