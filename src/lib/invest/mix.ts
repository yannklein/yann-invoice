import { round2, type Slot, type SymbolInfo } from './types';

/** One bar segment. `tint` is the lighter shade of its slot's colour: SRI funds and the Livret Bleu. */
export interface MixPart {
  label: string;
  name: string;
  valueEur: number;
  pct: number;
  sri: boolean;
  shade: 'base' | 'tint';
}

export interface MixGroup {
  slot: string;
  /** The slot's place in the plan; picks its colour, so it holds when another slot is empty. */
  index: number;
  valueEur: number;
  pct: number;
  parts: MixPart[];
}

export interface StockMix {
  totalEur: number;
  groups: MixGroup[];
}

const LIVRET = 'Livret Bleu';

/** The money each slot holds, split by fund. Counted like the buy table: the Livret Bleu sits in its slot, IBKR cash stays out. */
export function stockMix(slots: Slot[], symbols: SymbolInfo[], values: Record<string, number>, livretEur: number): StockMix {
  const info = new Map(symbols.map((s) => [s.symbol, s]));
  const filled = slots.map((s, index) => {
    const funds = s.holdSymbols.filter((sym) => values[sym] > 0).map((sym) => ({ label: sym, name: info.get(sym)?.name ?? sym, valueEur: values[sym], sri: !!info.get(sym)?.sri }));
    const ordered = [...funds.filter((f) => !f.sri), ...funds.filter((f) => f.sri)];
    const parts = s.livret && livretEur > 0 ? [...ordered, { label: LIVRET, name: LIVRET, valueEur: livretEur, sri: false }] : ordered;
    return { slot: s.slot, index, parts };
  });
  const totalEur = round2(filled.flatMap((g) => g.parts).reduce((sum, x) => sum + x.valueEur, 0));
  const pct = (x: number) => Math.round((x / totalEur) * 1000) / 10;
  const groups = filled.filter((g) => g.parts.length).map((g) => {
    const valueEur = round2(g.parts.reduce((sum, x) => sum + x.valueEur, 0));
    return {
      ...g, valueEur, pct: pct(valueEur),
      parts: g.parts.map((x) => ({ ...x, pct: pct(x.valueEur), shade: x.sri || x.label === LIVRET ? ('tint' as const) : ('base' as const) })),
    };
  });
  return { totalEur, groups };
}
