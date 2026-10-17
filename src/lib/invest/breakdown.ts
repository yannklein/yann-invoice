import { ibkrCashEur, livretMoves, livretOn } from './holdings';
import { flowsOf } from './simulate';
import { costBasis, realizedGain } from './stocks';
import { round2, type Portfolio } from './types';

/** Where today's money comes from. The parts add up to `todayEur` exactly (`otherEur` holds rounding). */
export interface MoneyBreakdown {
  /** Funds + uninvested IBKR cash + Livret Bleu. */
  todayEur: number;
  /** The funds at the latest prices. */
  fundsEur: number;
  ibkrCashEur: number;
  /** The IBKR account: funds + its cash (what the IBKR app calls value). */
  ibkrEur: number;
  livretEur: number;
  /** New savings put in, net of money taken out. */
  newMoneyEur: number;
  /** Market gain on the funds in the current accounts since they were bought: unrealized plus realized on sales. */
  stockGainEur: number;
  /** stockGainEur on what the funds held cost; null when nothing is held. */
  stockGainPct: number | null;
  dividendsEur: number;
  /** Livret Bleu interest. */
  interestEur: number;
  /** Currency moves on cash waiting in another currency, and fees: the `fx` rows that make cash match each statement. */
  currencyEur: number;
  /** When the first money was put in, or null. */
  firstFlowDate: string | null;
  /**
   * The earlier accounts (Rakuten, IBKR Japan): the euros that reached the current accounts minus the new money that went
   * in before `exactFrom`. It nets stock gains made there against currency moves and fees.
   */
  earlierEur: number;
  otherEur: number;
  /** todayEur − newMoneyEur: everything the money earned (or lost) since it was put in. */
  resultEur: number;
}

/**
 * `fundsValueEur` is the funds held at today's prices. Money that moved in from the earlier accounts is the transfers'
 * carried cost, the `internal` deposits and the Livret Bleu's opening balance.
 */
export function moneyBreakdown(p: Portfolio, fundsValueEur: number, today: string): MoneyBreakdown {
  const cash = ibkrCashEur(p);
  const livret = livretMoves(p.cash);
  const livretEur = livretOn(p.cash, today);
  const todayEur = round2(fundsValueEur + cash + livretEur);
  const flows = flowsOf(p);
  const newMoneyEur = round2(flows.reduce((s, f) => s + f.amountEur, 0));
  const heldCost = Object.values(costBasis(p.trades)).reduce((s, x) => s + x, 0);
  const stockGainEur = round2(fundsValueEur - heldCost + realizedGain(p.trades));
  const dividendsEur = round2(p.dividends.reduce((s, d) => s + d.amountEur, 0));
  const currencyEur = round2(p.deposits.filter((d) => d.kind === 'fx').reduce((s, d) => s + d.amountEur, 0));
  // Transfers between accounts net to zero once both sides are imported; a lone transfer in is money from an earlier pot.
  const movedIn =
    p.trades.filter((t) => t.source === 'transfer').reduce((s, t) => s + t.amountEur, 0) +
    p.deposits.filter((d) => d.kind === 'internal').reduce((s, d) => s + d.amountEur, 0) +
    livret.openingEur;
  const earlyNewMoney = flows.filter((f) => f.date < p.plan.exactFrom).reduce((s, f) => s + f.amountEur, 0);
  const earlierEur = Math.abs(movedIn - earlyNewMoney) >= 0.005 ? round2(movedIn - earlyNewMoney) : 0;
  const parts = newMoneyEur + stockGainEur + dividendsEur + livret.interestEur + currencyEur + earlierEur;
  return {
    todayEur, fundsEur: round2(fundsValueEur), ibkrCashEur: cash, ibkrEur: round2(fundsValueEur + cash), livretEur, newMoneyEur, stockGainEur, stockGainPct: heldCost > 0 ? (stockGainEur / heldCost) * 100 : null,
    dividendsEur, interestEur: livret.interestEur, currencyEur, firstFlowDate: flows[0]?.date ?? null, earlierEur,
    otherEur: round2(todayEur - parts), resultEur: round2(todayEur - newMoneyEur),
  };
}

/** A closed account (Rakuten): what went in, and its result once the payout (a negative `closed` row) is recorded. */
export interface ClosedHistory {
  putInJpy: number;
  putInEur: number;
  from: string;
  to: string;
  payoutEur: number | null;
  resultEur: number | null;
}

export function closedHistory(p: Pick<Portfolio, 'deposits'>): ClosedHistory | null {
  const rows = p.deposits.filter((d) => d.kind === 'closed').sort((a, b) => a.date.localeCompare(b.date));
  const ins = rows.filter((d) => d.amountEur > 0);
  if (!ins.length) return null;
  const outs = rows.filter((d) => d.amountEur < 0);
  const putInEur = round2(ins.reduce((s, d) => s + d.amountEur, 0));
  const payoutEur = outs.length ? round2(-outs.reduce((s, d) => s + d.amountEur, 0)) : null;
  return {
    putInJpy: ins.filter((d) => d.currency === 'JPY').reduce((s, d) => s + d.amount, 0),
    putInEur, from: ins[0].date, to: ins.at(-1)!.date, payoutEur, resultEur: payoutEur === null ? null : round2(payoutEur - putInEur),
  };
}
