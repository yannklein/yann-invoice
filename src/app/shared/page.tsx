import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SyncWarning } from '@/components/SyncWarning';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { sheetUrl } from '@/lib/invoice/pdf';
import { fetchEurJpy } from '@/lib/shared/fx';
import { addMonths, candidateInvoices, carryForward, currentMonth, incomeFromInvoice, invoiceMonth, MONTH_RE, monthLabel } from '@/lib/shared/model';
import type { MonthForm } from '@/lib/shared/schema';
import { findSharedId, readShared } from '@/lib/shared/store';
import { SharedMonthForm, type Candidate } from './SharedMonthForm';

const FALLBACK_FX = 177;

export default async function SharedPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const g = await getGoogle();
  const sharedId = await findSharedId(g.drive);
  if (!sharedId) {
    return (
      <Card>
        <CardHeader><CardTitle>Shared account</CardTitle></CardHeader>
        <CardContent className="text-sm">
          The “Shared account money” sheet is not imported yet. <Link className="underline" href="/settings">Import it in Settings</Link>.
        </CardContent>
      </Card>
    );
  }

  const month = m && MONTH_RE.test(m) ? m : currentMonth();
  const [data, { rows, failed }] = await Promise.all([readShared(g.sheets, sharedId), syncIndex(g, await requireIds(g))]);
  const record = data.months.find((x) => x.month === month);
  const previous = data.months.filter((x) => x.month < month).at(-1);

  let initial: MonthForm;
  let fxSource: string;
  if (record) {
    initial = { month, fxJpyPerEur: record.fxJpyPerEur, note: record.note, lines: data.lines.filter((l) => l.month === month) };
    fxSource = 'saved';
  } else {
    const live = await fetchEurJpy();
    initial = {
      month,
      fxJpyPerEur: live ?? previous?.fxJpyPerEur ?? FALLBACK_FX,
      note: '',
      lines: previous ? carryForward(data.lines.filter((l) => l.month === previous.month), month) : [],
    };
    fxSource = live ? 'ECB today' : previous ? `as in ${monthLabel(previous.month)}` : 'default';
  }

  const candidates: Candidate[] = candidateInvoices(rows, data.lines, month).map((r) => {
    const line = incomeFromInvoice(r, month);
    return { fileId: r.fileId, label: line.label, amount: line.amount, currency: line.currency, month: invoiceMonth(r), client: r.invoice.clientName, number: r.invoice.number ?? r.title };
  });
  const saved = data.months.map((x) => x.month).reverse();

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="mb-4 text-[clamp(2.4rem,8vw,4.5rem)] leading-[0.92] font-black tracking-[-0.03em]">Shared account</h1>
        <p className="border-l-[2.5px] border-foreground/20 pl-3 text-xs font-semibold tracking-[0.12em] text-foreground/40 uppercase">
          Monthly transfer · <a className="hover:text-foreground" href={sheetUrl(sharedId)} target="_blank">Google Sheet ↗</a>
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Months">
        <Link className={buttonVariants({ variant: 'outline', size: 'icon' })} href={`/shared?m=${addMonths(month, -1)}`} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-36 text-center text-lg font-bold">{monthLabel(month)}</span>
        <Link className={buttonVariants({ variant: 'outline', size: 'icon' })} href={`/shared?m=${addMonths(month, 1)}`} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Link>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {saved.slice(0, 6).map((s) => (
            <Link key={s} href={`/shared?m=${s}`} className={`rounded-full border px-2.5 py-1 ${s === month ? 'border-foreground/60' : 'border-foreground/10 text-foreground/50 hover:text-foreground'}`}>
              {s}
            </Link>
          ))}
        </div>
      </nav>

      <SyncWarning failed={failed.length} consequence="The invoice list below may be missing recent changes." />
      {data.invalidRows > 0 && (
        <p role="alert" className="rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-200">
          {data.invalidRows} row{data.invalidRows === 1 ? '' : 's'} in the Months/Lines tabs could not be read and {data.invalidRows === 1 ? 'is' : 'are'} ignored here (left untouched in the sheet).
        </p>
      )}

      <SharedMonthForm key={`${month}-${record?.updatedAt ?? 'draft'}`} initial={initial} saved={!!record} updatedAt={record?.updatedAt ?? null} fxSource={fxSource} candidates={candidates} />
    </div>
  );
}
