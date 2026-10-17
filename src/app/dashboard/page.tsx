import Link from 'next/link';
import { SyncWarning } from '@/components/SyncWarning';
import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid } from '@/lib/dashboard/business';
import { buildFx } from '@/lib/dashboard/convert';
import { dayMonth, delayLabel, money, monthShort, percent, signedPercent } from '@/lib/dashboard/format';
import { parseCcy, parsePeriod, periodLabel, periodMonths, periodParam, taxYearOf, todayDate, yearOptions } from '@/lib/dashboard/period';
import { instalmentsInProgress, nextFiling, taxQuarters } from '@/lib/dashboard/tax';
import { expenseBreakdown, incomeByCurrency, monthTransfer, transfers } from '@/lib/dashboard/household';
import { fetchDailyRates, fetchMonthlyRates } from '@/lib/fx/history';
import { getGoogle, type Google } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { holdings } from '@/lib/invest/holdings';
import { fetchSeries } from '@/lib/invest/prices';
import { closedHistory, moneyBreakdown } from '@/lib/invest/breakdown';
import { purchasesByMonth } from '@/lib/invest/purchases';
import { stockSummary } from '@/lib/invest/stocks';
import { findPortfolioId, readPortfolio } from '@/lib/invest/store';
import { quotesFor } from '@/lib/invest/view';
import { currentMonth, invoiceMonth, monthLabel } from '@/lib/shared/model';
import { findSharedId, readShared } from '@/lib/shared/store';
import { ExpenseChart } from './charts/ExpenseChart';
import { IncomeCurrencyChart } from './charts/IncomeCurrencyChart';
import { RevenueChart } from './charts/RevenueChart';
import { TransferChart } from './charts/TransferChart';
import { Breakdown, sinceLabel } from '../invest/Breakdown';
import { PurchasesChart } from '../invest/charts/PurchasesChart';
import { Empty, NotImported, Panel, Pill, Section, ShareBars, Stat } from './ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const signedMoney = (x: number) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), 'EUR')}`;
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
const minusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** The held funds at their latest price (two weeks of quotes is plenty), or null when no portfolio sheet is linked. */
async function loadStocks(g: Google, today: string) {
  const id = await findPortfolioId(g.drive);
  if (!id) return null;
  const p = await readPortfolio(g.sheets, id);
  const from = minusDays(today, 14);
  const yahoo = new Map(p.symbols.map((s) => [s.symbol, s.yahoo]));
  const symbols = [...new Set(Object.keys(holdings(p.trades)).map((s) => yahoo.get(s) ?? '').filter(Boolean))];
  const [rates, ...series] = await Promise.all([fetchDailyRates(from, today), ...symbols.map((y) => fetchSeries(y, from, today))]);
  const { quotes } = quotesFor(p, Object.fromEntries(symbols.map((y, i) => [y, series[i]])), rates, today);
  const summary = stockSummary(p, quotes);
  return { ...summary, breakdown: moneyBreakdown(p, summary.valueEur, today), closed: closedHistory(p), purchases: purchasesByMonth(p.trades, today) };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; ccy?: string }> }) {
  const params = await searchParams;
  const g = await getGoogle();
  const now = currentMonth();
  const today = todayDate();
  const [{ rows, failed }, shared, stocks] = await Promise.all([
    syncIndex(g, await requireIds(g)),
    findSharedId(g.drive).then((id) => (id ? readShared(g.sheets, id) : null)),
    loadStocks(g, today),
  ]);
  const oldest = rows.length ? rows.map(invoiceMonth).sort()[0] : null;
  const fx = buildFx(await fetchMonthlyRates(oldest ?? now, today), shared?.months ?? []);

  const years = yearOptions(oldest, now);
  const period = parsePeriod(params.p, years);
  const ccy = parseCcy(params.ccy);
  const months = periodMonths(period, now);
  const href = (p: string, c: string) => `/dashboard?${new URLSearchParams({ p, ccy: c })}`;

  const entries = revenueEntries(rows, ccy, fx);
  const revenue = revenueByMonth(entries, months, ccy);
  const clients = shareBy(entries, months, ccy, byClient);
  const skipped = skippedIn(rows, months, 'subtotal');
  const open = shared ? unpaid(rows, shared.lines, now, ccy, fx) : null;
  const delays = shared ? paymentDelay(rows, shared.lines) : [];
  const household = shared && {
    transfers: transfers(shared.months, shared.lines, ccy),
    expenses: expenseBreakdown(shared.months, shared.lines, ccy),
    income: incomeByCurrency(shared.months, shared.lines, ccy),
    thisMonth: monthTransfer(shared.months, shared.lines, now, ccy),
  };
  const year = taxYearOf(period, now);
  const tax = taxQuarters(rows, year, today, fx);
  const next = nextFiling(rows, today, fx);
  const instalments = shared ? instalmentsInProgress(shared.months, shared.lines) : [];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="mb-4 text-[clamp(2.4rem,8vw,4.5rem)] leading-[0.92] font-black tracking-[-0.03em]">Dashboard</h1>
        <p className="border-l-[2.5px] border-foreground/20 pl-3 text-xs font-semibold tracking-[0.12em] text-foreground/40 uppercase">
          {periodLabel(period)} · {ccy === 'JPY' ? 'Yen' : 'Euro'} · ECB monthly rates
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Period and currency">
        <Pill href={href('12m', ccy)} active={period.kind === '12m'}>Last 12 months</Pill>
        {years.map((y) => (
          <Pill key={y} href={href(String(y), ccy)} active={period.kind === 'year' && period.year === y}>{y}</Pill>
        ))}
        <span className="ml-auto flex gap-1.5">
          <Pill href={href(periodParam(period), 'EUR')} active={ccy === 'EUR'}>€</Pill>
          <Pill href={href(periodParam(period), 'JPY')} active={ccy === 'JPY'}>¥</Pill>
        </span>
      </nav>

      <SyncWarning failed={failed.length} consequence="The figures use those invoices as they were at the last successful sync." />
      {fx.approximate && (
        <p role="alert" className="rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-200">
          Exchange rates unavailable — converted amounts are approximate.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Revenue"
          value={money(revenue.total, ccy)}
          sub={revenue.changePct == null ? 'no previous period' : `${signedPercent(revenue.changePct)} vs previous period`}
        />
        <Stat
          label="Unpaid"
          value={open ? money(open.total, ccy) : '—'}
          sub={open ? plural(open.rows.length, 'invoice') : 'shared account not imported'}
        />
        <Stat
          label="Next filing"
          value={`Q${next.q} ${next.year}`}
          sub={`due ${dayMonth(next.due)} · VAT ${money(next.vat, 'EUR', true)} · IRPF ${money(next.irpf, 'EUR', true)}${next.status === 'so-far' ? ' so far' : ''}`}
        />
        <Stat
          label="Transfer this month"
          value={household?.thisMonth != null ? money(household.thisMonth, ccy) : '—'}
          warn={household?.thisMonth != null && household.thisMonth < 0}
          sub={!household ? 'shared account not imported' : household.thisMonth != null ? monthLabel(now) : <Link className="underline" href="/shared">not saved yet</Link>}
        />
      </div>

      <Section title="Stocks · €" aside={stocks && <Link className="underline" href="/invest">Details on Invest →</Link>}>
        {!stocks ? (
          <p className="text-sm text-foreground/60">
            No portfolio sheet yet. <Link className="underline" href="/settings#portfolio">Link “Stock mix” in Settings</Link>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Today"
                value={money(stocks.breakdown.todayEur, 'EUR')}
                sub={`IBKR + Livret Bleu ${money(stocks.breakdown.livretEur, 'EUR')} · put in ${money(stocks.breakdown.newMoneyEur, 'EUR')} ${sinceLabel(stocks.breakdown)}`}
              />
              <Stat
                label="IBKR account"
                value={money(stocks.breakdown.ibkrEur, 'EUR')}
                sub={`funds + cash ${money(stocks.breakdown.ibkrCashEur, 'EUR')}${stocks.priceDate ? ` · prices of ${dayMonth(stocks.priceDate)}` : ''}${stocks.stale ? ' · some stale' : ''}`}
              />
              <Stat
                label="Stock gain"
                value={signedMoney(stocks.breakdown.stockGainEur)}
                good={stocks.breakdown.stockGainEur > 0}
                warn={stocks.breakdown.stockGainEur < 0}
                sub={stocks.breakdown.stockGainPct == null ? 'on the funds you hold' : `${signedPct(stocks.breakdown.stockGainPct)} on what the funds cost`}
              />
              <Stat
                label="Total result"
                value={signedMoney(stocks.breakdown.resultEur)}
                good={stocks.breakdown.resultEur > 0}
                warn={stocks.breakdown.resultEur < 0}
                sub={stocks.breakdown.newMoneyEur > 0 ? `${signedPct((stocks.breakdown.resultEur / stocks.breakdown.newMoneyEur) * 100)} on money put in` : undefined}
              />
            </div>
            <Panel title="Where today's money comes from">
              <Breakdown b={stocks.breakdown} closed={stocks.closed} />
            </Panel>
            <Panel title={`Purchases · ${money(stocks.purchases.totalEur, 'EUR')} bought`}>
              {stocks.purchases.months.length ? <PurchasesChart months={stocks.purchases.months} symbols={stocks.purchases.symbols} /> : <Empty>No purchases yet</Empty>}
              <p className="mt-2 text-xs text-foreground/50">What each buy cost, commission included. Moving shares from IBKR Japan to Ireland isn’t a buy.</p>
            </Panel>
            <Panel title="By fund">
              {stocks.lines.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="eyebrow text-right text-foreground/50">
                      <tr>
                        <th className="py-1.5 text-left font-bold">Fund</th>
                        <th className="font-bold">Value</th>
                        <th className="font-bold">Share</th>
                        <th className="font-bold">Invested</th>
                        <th className="font-bold">Gain</th>
                      </tr>
                    </thead>
                    <tbody className="text-right">
                      {stocks.lines.map((l) => (
                        <tr key={l.symbol} className="border-t border-foreground/10">
                          <td className="py-1.5 text-left">
                            {l.symbol}{l.stale && <span className="text-foreground/40"> · stale price</span>}
                            <div className="text-xs text-foreground/40">{l.name}</div>
                          </td>
                          <td>{money(l.valueEur, 'EUR')}</td>
                          <td>{l.sharePct.toFixed(1)}%</td>
                          <td>{money(l.investedEur, 'EUR')}</td>
                          <td className={`whitespace-nowrap ${l.gainEur > 0 ? 'text-positive' : l.gainEur < 0 ? 'text-destructive' : ''}`}>
                            {signedMoney(l.gainEur)}{l.gainPct != null && ` · ${signedPct(l.gainPct)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No funds held yet</Empty>
              )}
              <p className="mt-3 text-xs text-foreground/50">
                Funds only. Shares moved in from IBKR Japan keep what was originally paid for them.
              </p>
            </Panel>
          </>
        )}
      </Section>

      <Section title="Business">
        <Panel title="Revenue by month">
          {revenue.series.length ? <RevenueChart data={revenue} ccy={ccy} /> : <Empty />}
          {skipped > 0 && <p className="mt-2 text-xs text-foreground/40">{plural(skipped, 'invoice')} skipped (no subtotal)</p>}
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Client share">
            {clients.length > 0 && <p className="mb-3 text-xs text-foreground/50">Top client: {percent(clients[0].pct)}</p>}
            <ShareBars rows={clients} ccy={ccy} />
          </Panel>
          <Panel title="Unpaid invoices">
            {!open ? (
              <NotImported />
            ) : open.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="eyebrow text-left text-foreground/50">
                    <tr><th className="py-1.5 font-bold">Number</th><th className="font-bold">Client</th><th className="font-bold">Month</th><th className="text-right font-bold">Total</th><th className="text-right font-bold">Age</th></tr>
                  </thead>
                  <tbody>
                    {open.rows.map((u) => (
                      <tr key={u.fileId} className="border-t border-foreground/10">
                        <td className="py-1.5"><Link className="underline" href={`/invoices/${u.fileId}`}>{u.number}</Link></td>
                        <td className="max-w-28 truncate pr-2">{u.client}</td>
                        <td className="whitespace-nowrap">{monthShort(u.month)}</td>
                        <td className="text-right tabular-nums">{money(u.total, u.currency, true)}</td>
                        <td className="text-right whitespace-nowrap">{u.ageMonths === 0 ? 'this month' : `${u.ageMonths} mo`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Everything since {monthLabel(open.from)} has been paid</Empty>
            )}
            {delays.length > 0 && (
              <p className="mt-3 text-xs text-foreground/50">Typical delay: {delays.map((d) => `${d.name}: ${delayLabel(d.months)}`).join(' · ')}</p>
            )}
          </Panel>
          <Panel title="By country">
            <ShareBars rows={shareBy(entries, months, ccy, byCountry)} ccy={ccy} />
          </Panel>
          <Panel title="By service">
            <ShareBars rows={shareBy(entries, months, ccy, byService)} ccy={ccy} />
          </Panel>
        </div>
      </Section>

      <Section title={`Tax ${year} · €`}>
        <Panel title="Quarters">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="eyebrow text-right text-foreground/50">
                <tr>
                  <th className="py-1.5 text-left font-bold">Quarter</th>
                  <th className="font-bold">Revenue base</th>
                  <th className="font-bold">VAT charged</th>
                  <th className="font-bold">IRPF withheld</th>
                  <th className="font-bold">Foreign withholding</th>
                  <th className="font-bold">Due</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {tax.quarters.map((q) => (
                  <tr key={q.q} className={`border-t border-foreground/10 ${q.status === 'future' ? 'text-foreground/40' : ''}`}>
                    <td className="py-1.5 text-left whitespace-nowrap">Q{q.q}{q.status === 'so-far' && <span className="text-foreground/50"> · so far</span>}</td>
                    <td>{money(q.base, 'EUR', true)}</td>
                    <td>{money(q.vat, 'EUR', true)}</td>
                    <td>{money(q.irpf, 'EUR', true)}</td>
                    <td>{money(q.withholding, 'EUR', true)}</td>
                    <td className="whitespace-nowrap">{dayMonth(q.due)}</td>
                  </tr>
                ))}
                <tr className="border-t border-foreground/30 font-bold">
                  <td className="py-1.5 text-left">{year}</td>
                  <td>{money(tax.total.base, 'EUR', true)}</td>
                  <td>{money(tax.total.vat, 'EUR', true)}</td>
                  <td>{money(tax.total.irpf, 'EUR', true)}</td>
                  <td>{money(tax.total.withholding, 'EUR', true)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-foreground/50">
            VAT charged feeds Modelo 303. IRPF withheld is subtracted in Modelo 130. Foreign withholding is a credit in the annual return.
            The Modelo 130 payment itself is not estimated: business expenses are not tracked here.
            {tax.skipped > 0 && ` ${plural(tax.skipped, 'invoice')} skipped (no subtotal).`}
          </p>
        </Panel>
        <Panel title="Instalments in progress">
          {!shared ? (
            <NotImported />
          ) : instalments.length ? (
            <ul className="space-y-3">
              {instalments.map((i) => (
                <li key={i.label} className="space-y-1 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <span>{i.label}</span>
                    <span className="text-xs tabular-nums text-foreground/60">
                      {i.index} of {i.count} · {money(i.amount, i.currency, true)} each · {money(i.remaining, i.currency, true)} left
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(i.index / i.count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No instalments running</Empty>
          )}
        </Panel>
      </Section>

      <Section title="Household">
        {!household ? (
          <NotImported />
        ) : !household.transfers.points.length ? (
          <Empty>No saved months yet</Empty>
        ) : (
          <>
            <Panel title="Transfer per month">
              <TransferChart points={household.transfers.points} average={household.transfers.average} ccy={ccy} />
              <p className="mt-2 text-xs text-foreground/50">Red bars: months where expenses were larger than income. Dashed line: average.</p>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Expenses">
                <ExpenseChart points={household.expenses} ccy={ccy} />
              </Panel>
              <Panel title="Income by currency">
                <IncomeCurrencyChart points={household.income} ccy={ccy} />
              </Panel>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
