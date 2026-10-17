import { money } from '@/lib/dashboard/format';
import type { ClosedHistory, MoneyBreakdown } from '@/lib/invest/breakdown';

const signed = (x: number) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), 'EUR')}`;
const monthYear = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const yen = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'JPY' }).format(x);

/** "since Mar 2025" from the first money put in. */
export const sinceLabel = (b: MoneyBreakdown) => (b.firstFlowDate ? `since ${monthYear(b.firstFlowDate)}` : 'nothing yet');

/** Where today's money comes from, as lines that add up to today's total. Shared by /dashboard and /invest. */
export function Breakdown({ b, closed }: { b: MoneyBreakdown; closed?: ClosedHistory | null }) {
  const rows: { label: string; sub: string; value: number; sign: boolean; strong?: boolean }[] = [
    { label: 'Money you put in', sub: `into IBKR and the Livret Bleu ${sinceLabel(b)}, minus money taken out`, value: b.newMoneyEur, sign: false },
    {
      label: 'Stock gain',
      sub: `on the funds you hold, since you bought them${b.stockGainPct == null ? '' : ` (${b.stockGainPct >= 0 ? '+' : '−'}${Math.abs(b.stockGainPct).toFixed(1)}% on what they cost)`}`,
      value: b.stockGainEur, sign: true, strong: true,
    },
    { label: 'Dividends', sub: 'paid out as cash, after tax', value: b.dividendsEur, sign: true },
    ...(b.currencyEur ? [{ label: 'Currency moves and fees', sub: 'cash waiting in yen before buying, conversions and broker fees', value: b.currencyEur, sign: true }] : []),
    ...(b.interestEur ? [{ label: 'Livret Bleu interest', sub: '', value: b.interestEur, sign: true }] : []),
    ...(b.earlierEur
      ? [{ label: 'Moved in from other accounts', sub: 'positions or money brought in without a matching record of where they came from', value: b.earlierEur, sign: true }]
      : []),
    ...(Math.abs(b.otherEur) >= 1 ? [{ label: 'Other', sub: 'rounding and currency differences', value: b.otherEur, sign: true }] : []),
  ];
  return (
    <table className="w-full text-sm tabular-nums">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-foreground/10 first:border-t-0">
            <td className="py-2 pr-4">
              <span className={r.strong ? 'font-semibold' : ''}>{r.label}</span>
              {r.sub && <div className="text-xs text-foreground/45">{r.sub}</div>}
            </td>
            <td className={`whitespace-nowrap text-right ${r.strong ? 'font-semibold' : ''} ${r.sign && r.value < 0 ? 'text-destructive' : r.sign && r.value > 0 ? 'text-positive' : ''}`}>
              {r.sign ? signed(r.value) : money(r.value, 'EUR')}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-foreground/30">
          <td className="py-2 pr-4">
            <span className="font-black">Today</span>
            <div className="text-xs text-foreground/45">IBKR account {money(b.ibkrEur, 'EUR')} + Livret Bleu {money(b.livretEur, 'EUR')}</div>
          </td>
          <td className="text-right font-black">{money(b.todayEur, 'EUR')}</td>
        </tr>
      </tbody>
      {closed && (
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-3 text-xs text-foreground/45">
              Not counted: Rakuten Securities (closed), {yen(closed.putInJpy)} put in {monthYear(closed.from)}–{monthYear(closed.to)}
              {closed.resultEur === null
                ? ' · its payout isn’t recorded yet (add a negative “closed” row in the Deposits tab to see its result).'
                : ` · paid out ${money(closed.payoutEur!, 'EUR')}, result ${signed(closed.resultEur)}.`}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
