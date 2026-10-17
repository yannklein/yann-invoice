import { money } from '@/lib/dashboard/format';
import type { MoneyBreakdown } from '@/lib/invest/breakdown';

const signed = (x: number) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), 'EUR')}`;

/** Where today's money comes from, as lines that add up to today's total. Shared by /dashboard and /invest. */
export function Breakdown({ b }: { b: MoneyBreakdown }) {
  const rows: { label: string; sub: string; value: number; sign: boolean; strong?: boolean }[] = [
    { label: 'Money you put in', sub: 'new savings since Dec 2022, minus money taken out', value: b.newMoneyEur, sign: false },
    {
      label: 'Stock gain',
      sub: `on the funds you hold, since you bought them${b.stockGainPct == null ? '' : ` (${b.stockGainPct >= 0 ? '+' : '−'}${Math.abs(b.stockGainPct).toFixed(1)}% on what they cost)`}`,
      value: b.stockGainEur, sign: true, strong: true,
    },
    { label: 'Dividends', sub: 'paid out as cash', value: b.dividendsEur, sign: true },
    ...(b.interestEur ? [{ label: 'Livret Bleu interest', sub: '', value: b.interestEur, sign: true }] : []),
    ...(b.earlierEur
      ? [{ label: 'Earlier accounts (Rakuten, IBKR Japan)', sub: 'gains made there, minus the yen’s fall against the euro and fees', value: b.earlierEur, sign: true }]
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
          <td className="py-2 pr-4 font-black">Today</td>
          <td className="text-right font-black">{money(b.todayEur, 'EUR')}</td>
        </tr>
      </tbody>
    </table>
  );
}
