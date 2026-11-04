import { describe, expect, it } from 'vitest';
import { stockMix } from '@/lib/invest/mix';
import type { Slot, SymbolInfo } from '@/lib/invest/types';

const slot = (name: string, holdSymbols: string[], livret = false): Slot => ({
  slot: name, kind: 'stocks', targetPct: 50, holdSymbols, buySymbol: holdSymbols[0], sriSymbol: null, livret,
});
const symbol = (s: string, sri = false): SymbolInfo => ({ symbol: s, isin: '', yahoo: '', name: `${s} fund`, terPct: null, sri });
const SLOTS = [slot('World', ['SUSW', 'IWRD']), slot('Bonds', ['CSBGE3'], true)];
const SYMBOLS = [symbol('IWRD'), symbol('SUSW', true), symbol('CSBGE3')];

describe('stockMix', () => {
  const mix = stockMix(SLOTS, SYMBOLS, { IWRD: 500, SUSW: 100, CSBGE3: 300 }, 100);

  it('adds the Livret Bleu to the slot that counts it, so the shares match the slot percentages', () => {
    expect(mix.totalEur).toBe(1000);
    expect(mix.groups.map((g) => [g.slot, g.valueEur, g.pct])).toEqual([['World', 600, 60], ['Bonds', 400, 40]]);
  });

  it('puts the regular fund before its SRI version, then the Livret Bleu', () => {
    expect(mix.groups[0].parts.map((x) => [x.label, x.shade, x.valueEur, x.pct])).toEqual([['IWRD', 'base', 500, 50], ['SUSW', 'tint', 100, 10]]);
    expect(mix.groups[1].parts.map((x) => [x.label, x.shade])).toEqual([['CSBGE3', 'base'], ['Livret Bleu', 'tint']]);
  });

  it('marks SRI funds', () => expect(mix.groups[0].parts.map((x) => x.sri)).toEqual([false, true]));

  it('leaves out funds and a Livret Bleu with nothing in them, and slots left empty', () => {
    const m = stockMix([...SLOTS, slot('Europe', ['IMEU'])], SYMBOLS, { IWRD: 500 }, 0);
    expect(m.groups.map((g) => g.slot)).toEqual(['World']);
    expect(m.groups[0].parts.map((x) => x.label)).toEqual(['IWRD']);
  });

  it('keeps each slot’s place in the plan, so its colour survives another slot emptying', () => {
    expect(stockMix(SLOTS, SYMBOLS, { CSBGE3: 100 }, 0).groups.map((g) => [g.slot, g.index])).toEqual([['Bonds', 1]]);
  });

  it('is empty with nothing held', () => expect(stockMix(SLOTS, SYMBOLS, {}, 0)).toEqual({ totalEur: 0, groups: [] }));
});
