import { ibkrCashEur, livretMoves, livretOn } from './holdings';
import { flowsOf } from './simulate';
import { costBasis, realizedGain } from './stocks';
import { round2, type Portfolio } from './types';

/** Where today's money comes from. The parts add up to `todayEur` exactly (`otherEur` holds rounding). */
export interface MoneyBreakdown {
  /** Funds + uninvested IBKR cash + Livret Bleu. */
  todayEur: number;
  /** New savings put in, net of money taken out. */
  newMoneyEur: number;
  /** Market gain on the funds in the current accounts since they were bought: unrealized plus realized on sales. */
  stockGainEur: number;
  /** stockGainEur on what the funds held cost; null when nothing is held. */
  stockGainPct: number | null;
  dividendsEur: number;
  /** Livret Bleu interest. */
  interestEur: number;
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
  const todayEur = round2(fundsValueEur + cash + livretOn(p.cash, today));
  const flows = flowsOf(p);
  const newMoneyEur = round2(flows.reduce((s, f) => s + f.amountEur, 0));
  const heldCost = Object.values(costBasis(p.trades)).reduce((s, x) => s + x, 0);
  const stockGainEur = round2(fundsValueEur - heldCost + realizedGain(p.trades));
  const dividendsEur = round2(p.dividends.reduce((s, d) => s + d.amountEur, 0));
  const movedIn =
    p.trades.filter((t) => t.source === 'transfer' && t.quantity > 0).reduce((s, t) => s + t.amountEur, 0) +
    p.deposits.filter((d) => d.kind === 'internal').reduce((s, d) => s + d.amountEur, 0) +
    livret.openingEur;
  const earlyNewMoney = flows.filter((f) => f.date < p.plan.exactFrom).reduce((s, f) => s + f.amountEur, 0);
  const earlierEur = movedIn || earlyNewMoney ? round2(movedIn - earlyNewMoney) : 0;
  const parts = newMoneyEur + stockGainEur + dividendsEur + livret.interestEur + earlierEur;
  return {
    todayEur, newMoneyEur, stockGainEur, stockGainPct: heldCost > 0 ? (stockGainEur / heldCost) * 100 : null,
    dividendsEur, interestEur: livret.interestEur, earlierEur, otherEur: round2(todayEur - parts), resultEur: round2(todayEur - newMoneyEur),
  };
}
