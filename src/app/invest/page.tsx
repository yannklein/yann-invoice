import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/dashboard/format';
import { todayDate } from '@/lib/dashboard/period';
import { fetchDailyRates } from '@/lib/fx/history';
import { getGoogle } from '@/lib/google/client';
import { holdings } from '@/lib/invest/holdings';
import { fetchSeries, type PriceSeries } from '@/lib/invest/prices';
import { flowsOf } from '@/lib/invest/simulate';
import { findPortfolioId, readPortfolio } from '@/lib/invest/store';
import { buildView } from '@/lib/invest/view';
import { sheetUrl } from '@/lib/invoice/pdf';
import { Panel, Section, Stat } from '../dashboard/ui';
import { addCashAction, switchToSriAction } from './actions';
import { Breakdown } from './Breakdown';
import { HistoryChart, type HistoryPoint } from './charts/HistoryChart';
import { LegendsChart, type ChartRow, type ChartSeries } from './charts/LegendsChart';
import { LongGame } from './LongGame';
import { UploadCard } from './UploadCard';

const LEGEND_COLORS = ['var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-other)', 'var(--chart-muted)', 'var(--chart-other)'];
const LEGEND_DASH = [undefined, undefined, undefined, undefined, undefined, undefined, '2 3'];
const DEFAULT_ON = ['Hallam EU', 'Hallam SRI', 'Buffett 90/10'];

const eur = (x: number) => money(x, 'EUR');
const eurCents = (x: number) => money(x, 'EUR', true);
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYear = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const minusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ amount?: string }> }) {
  const { amount } = await searchParams;
  const g = await getGoogle();
  const id = await findPortfolioId(g.drive);
  if (!id) {
    return (
      <Panel title="Invest">
        <p className="text-sm">
          No portfolio sheet yet. <Link className="underline" href="/settings#portfolio">Link “Stock mix” in Settings</Link>.
        </p>
      </Panel>
    );
  }

  const p = await readPortfolio(g.sheets, id);
  const today = todayDate();
  const firstDate = [flowsOf(p)[0]?.date, p.snapshots[0]?.date, p.trades[0]?.date, today].filter((d): d is string => !!d).sort()[0];
  const from = minusDays(firstDate, 7);
  const bySymbol = new Map(p.symbols.map((s) => [s.symbol, s.yahoo]));
  const wanted = [...Object.keys(holdings(p.trades)), ...p.slots.flatMap((s) => [s.buySymbol, s.sriSymbol ?? ''])].map((s) => bySymbol.get(s) ?? '');
  const yahoos = [...new Set([...wanted, ...p.benchmarks.map((b) => b.yahoo)].filter(Boolean))];
  const [rates, ...fetched] = await Promise.all([fetchDailyRates(from, today), ...yahoos.map((y) => fetchSeries(y, from, today))]);
  const series: Record<string, PriceSeries | null> = Object.fromEntries(yahoos.map((y, i) => [y, fetched[i]]));
  const override = amount !== undefined && amount !== '' && Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : null;
  const v = buildView(p, series, rates, today, override);

  // Chart rows: one per weekly date, You split into exact and approximate (sharing the first exact point so the line joins).
  const firstExact = v.you.find((x) => !x.approx);
  const rows = new Map<string, ChartRow>();
  const row = (date: string) => rows.get(date) ?? rows.set(date, { date }).get(date)!;
  for (const pt of v.you) row(pt.date)[pt.approx ? 'youApprox' : 'you'] = pt.value;
  if (firstExact && v.you.some((x) => x.approx)) row(firstExact.date).youApprox = firstExact.value;
  const legendSeries: ChartSeries[] = v.legends.map((l, i) => ({ key: `l${i}`, label: l.name, color: LEGEND_COLORS[i % LEGEND_COLORS.length], dash: LEGEND_DASH[i] }));
  v.legends.forEach((l, i) => l.points.forEach((pt) => (row(pt.date)[`l${i}`] = pt.value)));
  const chartRows = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  const flows = flowsOf(p);
  const history: HistoryPoint[] = v.you.map((pt) => ({
    date: pt.date,
    you: pt.approx ? null : pt.value,
    youApprox: pt.approx || pt === firstExact ? pt.value : null,
    invested: flows.filter((f) => f.date <= pt.date).reduce((s, f) => s + f.amountEur, 0),
  }));
  const staleQuotes = v.quotes.filter((q) => q.stale);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow">Next buy</p>
        <h1 className="text-3xl font-black tracking-tight">
          {v.nextBuy ? <>{monthYear(v.nextBuy.date)} <span className="text-foreground/40">{v.nextBuy.days === 0 ? '· today!' : `· in ${v.nextBuy.days} days`}</span></> : 'No buy months set'}
        </h1>
        <p className="text-sm text-foreground/60">
          {v.lazyDays !== null && <>Lazy streak 🦥 {v.lazyDays} days · </>}
          {v.badges.map((b) => (
            <span key={b.id} title={b.hint} className={`mr-2 ${b.earned ? '' : 'opacity-30 grayscale'}`}>{b.emoji} {b.label}</span>
          ))}
        </p>
        <ul className="space-y-1 text-sm text-foreground/80">{v.quips.map((q) => <li key={q}>“{q}”</li>)}</ul>
      </header>

      {(v.invalidRows > 0 || v.unassigned.length > 0 || staleQuotes.length > 0) && (
        <div className="space-y-1 rounded-lg border border-amber-400/30 p-3 text-sm text-amber-400">
          {v.invalidRows > 0 && <p>{v.invalidRows} row(s) in the sheet could not be read and are ignored. <a className="underline" href={sheetUrl(id)} target="_blank">Open sheet ↗</a></p>}
          {v.unassigned.length > 0 && <p>Not in any slot (add them to a slot&apos;s holdSymbols in the Slots tab): {v.unassigned.join(', ')}</p>}
          {staleQuotes.map((q) => <p key={q.symbol}>{q.symbol}: Price from {q.date} — live quote unavailable</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today" value={eur(v.breakdown.todayEur)} sub="funds, IBKR cash, Livret Bleu" />
        <Stat label="Put in" value={eur(v.breakdown.newMoneyEur)} sub="new savings since Dec 2022" />
        <Stat
          label="Total result"
          value={`${v.breakdown.resultEur >= 0 ? '+' : '−'}${eur(Math.abs(v.breakdown.resultEur))}`}
          sub={`of which stock gain ${v.breakdown.stockGainEur >= 0 ? '+' : '−'}${eur(Math.abs(v.breakdown.stockGainEur))}`}
          warn={v.breakdown.resultEur < 0}
        />
        <Stat label="Cash in IBKR" value={eurCents(v.ibkrCashEur)} sub={`Livret Bleu ${eur(v.livretEur)}`} />
      </div>

      <Panel title="Where today's money comes from">
        <Breakdown b={v.breakdown} />
      </Panel>

      <Section title="This round">
        <Panel title="What to buy">
          <div className="space-y-5 text-sm">
            <form key={v.round.amountEur} className="flex flex-wrap items-end gap-2" action="/invest">
              <label className="grid gap-1">
                <span className="eyebrow">Amount</span>
                <Input name="amount" type="number" min={0} step={50} defaultValue={v.round.amountEur} className="w-36" />
              </label>
              <Button type="submit" variant="outline">Recalculate</Button>
              {v.round.fromCashEur > 0 && <span className="text-xs text-foreground/50">includes {eurCents(v.round.fromCashEur)} already in IBKR</span>}
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left tabular-nums">
                <thead className="text-xs text-foreground/50">
                  <tr><th className="py-1">Slot</th><th>Now → target</th><th>Buy</th><th className="text-right">Buy</th><th className="text-right">≈ Units</th></tr>
                </thead>
                <tbody>
                  {v.round.lines.map((l) => (
                    <tr key={l.slot} className="border-t border-foreground/10">
                      <td className="py-2 font-semibold">{l.slot}</td>
                      <td>{l.nowPct}% → {l.targetPct}%</td>
                      <td>{l.slot === 'Bonds' && l.buyEur > 0 ? `${l.symbol} or Livret Bleu` : l.symbol}</td>
                      <td className={`text-right font-black ${l.buyEur === 0 ? 'text-foreground/30' : ''}`}>{eur(l.buyEur)}</td>
                      <td className="text-right">{l.units === null ? '—' : l.units.toFixed(4)}{l.stale && l.units !== null ? ' *' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {v.round.driftNote && <p className="text-foreground/60">Your mix has drifted more than 10 points from target. Still fine: this round&apos;s buy already steers it back, no selling needed.</p>}
            <UploadCard />
          </div>
        </Panel>
      </Section>

      <Section title="SRI path">
        <Panel title={`SRI share of your ETFs: ${v.sriSharePct}%`}>
          <div className="space-y-3 text-sm">
            <p className="text-foreground/60">New money goes green; nothing gets sold (no tax event, no fees).</p>
            {v.sri.map((s) => (
              <div key={s.slot} className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-3">
                <div>
                  <p className="font-semibold">{s.slot}</p>
                  {s.candidate ? (
                    <p className="text-foreground/60">
                      {s.usingSri ? 'New money already goes to ' : `${s.current?.symbol ?? '?'} (${s.current?.terPct ?? '?'}%/yr) → `}
                      {s.candidate.name} ({s.candidate.terPct ?? '?'}%/yr)
                      {!s.usingSri && s.current?.terPct != null && s.candidate.terPct != null && s.candidate.terPct < s.current.terPct && <b> · cheaper too</b>}
                    </p>
                  ) : (
                    <p className="text-foreground/60">No SRI alternative set for this slot.</p>
                  )}
                </div>
                {s.candidate && !s.usingSri && (
                  <form action={switchToSriAction}>
                    <input type="hidden" name="slot" value={s.slot} />
                    <Button type="submit" variant="outline">Use for new buys</Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      <Section title="Long game">
        <Panel title="How much per buy?">
          <LongGame {...v.longGame} />
        </Panel>
      </Section>

      <Section title="You vs the legends">
        <Panel title="Same new money, same dates">
          <div className="space-y-4">
            {chartRows.length ? <LegendsChart data={chartRows} series={legendSeries} defaultOn={legendSeries.filter((s) => DEFAULT_ON.includes(s.label)).map((s) => s.key)} /> : <p className="text-sm text-foreground/50">No new money recorded yet.</p>}
            {v.you.some((x) => x.approx) && <p className="text-xs text-foreground/50">Before {longDay(p.plan.exactFrom)}: from your sheet (approximate)</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm tabular-nums">
                <thead className="text-xs text-foreground/50"><tr><th className="py-1">Strategy</th><th className="text-right">Value</th><th className="text-right">vs you</th><th className="pl-4">Verdict</th></tr></thead>
                <tbody>
                  <tr className="border-t border-foreground/10"><td className="py-2 font-semibold">You</td><td className="text-right font-black">{eur(v.valueEur)}</td><td className="text-right">—</td><td className="pl-4 text-foreground/60">The one that actually happened.</td></tr>
                  {v.legends.map((l) => (
                    <tr key={l.name} className="border-t border-foreground/10">
                      <td className="py-2">{l.name}</td>
                      <td className="text-right">{l.valueEur === null ? '—' : eur(l.valueEur)}</td>
                      <td className="text-right">{l.diffVsYou === null ? '—' : `${l.diffVsYou > 0 ? '+' : '−'}${eur(Math.abs(l.diffVsYou))}`}</td>
                      <td className="pl-4 text-foreground/60">{l.quip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {v.legends.some((l) => l.bookWeights) && <p className="text-xs text-foreground/50">Weights per book summary — edit in the Benchmarks tab</p>}
            {v.missingSeries.length > 0 && <p className="text-xs text-amber-400">No prices for {v.missingSeries.join(', ')}; those parts count as cash.</p>}
          </div>
        </Panel>
      </Section>

      <Section title="History">
        <Panel title="Value over time">
          <div className="space-y-6 text-sm">
            {history.length ? <HistoryChart data={history} /> : <p className="text-foreground/50">Nothing yet.</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left tabular-nums">
                <thead className="text-xs text-foreground/50"><tr><th className="py-1">Date</th><th>Symbol</th><th className="text-right">Units</th><th className="text-right">€</th><th className="pl-4">Source</th></tr></thead>
                <tbody>
                  {[...v.trades].reverse().map((t) => (
                    <tr key={t.key} className="border-t border-foreground/10">
                      <td className="py-1.5">{t.date}</td><td>{t.symbol}</td><td className="text-right">{t.quantity}</td><td className="text-right">{eurCents(t.amountEur)}</td><td className="pl-4 text-foreground/60">{t.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form key={v.livretEur} action={addCashAction} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1"><span className="eyebrow">Livret Bleu on</span><Input name="date" type="date" defaultValue={today} className="w-40" /></label>
              <label className="grid gap-1"><span className="eyebrow">Balance €</span><Input name="balance" type="number" step="0.01" required defaultValue={v.livretEur || undefined} className="w-32" /></label>
              <label className="grid gap-1"><span className="eyebrow">New money paid in €</span><Input name="deposit" type="number" step="0.01" defaultValue={0} className="w-32" /></label>
              <Button type="submit" variant="outline">Save balance</Button>
            </form>
            <p><a className="underline" href={sheetUrl(id)} target="_blank">Open sheet ↗</a></p>
          </div>
        </Panel>
      </Section>
    </div>
  );
}
