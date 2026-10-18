import Link from 'next/link';
import { SyncWarning } from '@/components/SyncWarning';
import { byClient, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid } from '@/lib/dashboard/business';
import { buildFx, convert } from '@/lib/dashboard/convert';
import { dayMonth, money, percent, signedPercent } from '@/lib/dashboard/format';
import { type DisplayCurrency, parseCcy, parsePeriod, periodLabel, periodMonths, periodParam, todayDate, yearOptions } from '@/lib/dashboard/period';
import { nextFiling } from '@/lib/dashboard/tax';
import { monthTransfer, transfers } from '@/lib/dashboard/household';
import { fetchMonthlyRates } from '@/lib/fx/history';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { loadMoneyToday } from '@/lib/invest/load';
import { currentMonth, invoiceMonth, monthLabel } from '@/lib/shared/model';
import { findSharedId, readShared } from '@/lib/shared/store';
import { RevenueChart } from './charts/RevenueChart';
import { TransferChart } from './charts/TransferChart';
import { sinceLabel } from '../invest/Breakdown';
import { Empty, NotImported, Panel, Pill, ShareBars, Stat } from './ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const signedMoney = (x: number, c: DisplayCurrency) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), c)}`;
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; ccy?: string }> }) {
  const params = await searchParams;
  const g = await getGoogle();
  const now = currentMonth();
  const today = todayDate();
  const [{ rows, failed }, shared, stocks] = await Promise.all([
    syncIndex(g, await requireIds(g)),
    findSharedId(g.drive).then((id) => (id ? readShared(g.sheets, id) : null)),
    loadMoneyToday(g, today),
  ]);
  const oldest = rows.length ? rows.map(invoiceMonth).sort()[0] : null;
  const fx = buildFx(await fetchMonthlyRates(oldest ?? now, today), shared?.months ?? []);

  const years = yearOptions(oldest, now);
  const period = parsePeriod(params.p, years);
  const ccy = parseCcy(params.ccy);
  const months = periodMonths(period, now);
  const href = (p: string, c: string) => `/dashboard?${new URLSearchParams({ p, ccy: c })}`;
  const fromEur = (eur: number) => convert(eur, 'EUR', ccy, now, fx);

  const entries = revenueEntries(rows, ccy, fx);
  const revenue = revenueByMonth(entries, months, ccy);
  const clients = shareBy(entries, months, ccy, byClient);
  const skipped = skippedIn(rows, months, 'subtotal');
  const open = shared ? unpaid(rows, shared.lines, now, ccy, fx) : null;
  const household = shared && {
    transfers: transfers(shared.months, shared.lines, ccy),
    thisMonth: monthTransfer(shared.months, shared.lines, now, ccy),
  };
  const next = nextFiling(rows, today, fx);

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Revenue"
          value={money(revenue.total, ccy)}
          sub={revenue.changePct == null ? 'no previous period' : `${signedPercent(revenue.changePct)} vs previous period`}
        />
        <Stat
          label="Unpaid"
          value={open ? money(open.total, ccy) : '—'}
          warn={!!open?.rows.length}
          sub={!open ? 'shared account not imported' : open.rows.length ? <Link className="underline" href="/invoices">{plural(open.rows.length, 'invoice')}</Link> : 'all paid'}
        />
        <Stat
          label="Next filing"
          value={`Q${next.q} ${next.year}`}
          sub={`due ${dayMonth(next.due)} · VAT ${money(fromEur(next.vat), ccy, ccy === 'EUR')}${next.status === 'so-far' ? ' so far' : ''}`}
        />
        <Stat
          label="To shared account"
          value={household?.thisMonth != null ? money(household.thisMonth, ccy) : '—'}
          warn={household?.thisMonth != null && household.thisMonth < 0}
          sub={!household ? 'shared account not imported' : household.thisMonth != null ? monthLabel(now) : <Link className="underline" href="/shared">not saved yet</Link>}
        />
        <Stat
          label="Investments"
          value={stocks ? money(fromEur(stocks.todayEur), ccy) : '—'}
          sub={stocks ? <Link className="underline" href="/invest">IBKR + Livret Bleu</Link> : <Link className="underline" href="/settings#portfolio">link a portfolio sheet</Link>}
        />
        <Stat
          label="Investment result"
          value={stocks ? signedMoney(fromEur(stocks.resultEur), ccy) : '—'}
          good={!!stocks && stocks.resultEur > 0}
          warn={!!stocks && stocks.resultEur < 0}
          sub={stocks && stocks.newMoneyEur > 0 ? `${signedPct((stocks.resultEur / stocks.newMoneyEur) * 100)} on money put in ${sinceLabel(stocks)}` : undefined}
        />
      </div>

      <Panel title="Revenue by month">
        {revenue.series.length ? <RevenueChart data={revenue} ccy={ccy} /> : <Empty />}
        {skipped > 0 && <p className="mt-2 text-xs text-foreground/40">{plural(skipped, 'invoice')} skipped (no subtotal)</p>}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={clients.length ? `Client share · top ${percent(clients[0].pct)}` : 'Client share'}>
          <ShareBars rows={clients} ccy={ccy} />
        </Panel>
        <Panel title="To shared account per month">
          {!household ? (
            <NotImported />
          ) : household.transfers.points.length ? (
            <TransferChart points={household.transfers.points} average={household.transfers.average} ccy={ccy} />
          ) : (
            <Empty>No saved months yet</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
