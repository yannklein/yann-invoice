import Link from 'next/link';
import { SyncWarning } from '@/components/SyncWarning';
import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid } from '@/lib/dashboard/business';
import { buildFx } from '@/lib/dashboard/convert';
import { delayLabel, money, monthShort, percent, signedPercent } from '@/lib/dashboard/format';
import { parseCcy, parsePeriod, periodLabel, periodMonths, periodParam, todayDate, yearOptions } from '@/lib/dashboard/period';
import { fetchMonthlyRates } from '@/lib/fx/history';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { currentMonth, invoiceMonth, monthLabel } from '@/lib/shared/model';
import { findSharedId, readShared } from '@/lib/shared/store';
import { RevenueChart } from './charts/RevenueChart';
import { Empty, NotImported, Panel, Pill, Section, ShareBars, Stat } from './ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; ccy?: string }> }) {
  const params = await searchParams;
  const g = await getGoogle();
  const [{ rows, failed }, shared] = await Promise.all([
    syncIndex(g, await requireIds(g)),
    findSharedId(g.drive).then((id) => (id ? readShared(g.sheets, id) : null)),
  ]);
  const now = currentMonth();
  const today = todayDate();
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
      </div>

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
    </div>
  );
}
