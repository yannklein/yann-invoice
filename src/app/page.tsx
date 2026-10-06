import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { SyncWarning } from '@/components/SyncWarning';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { defaultDir, parseSort, sortRows, type Sort, type SortKey } from '@/lib/invoice/derive';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney } from '@/lib/invoice/totals';

function SortableHead({ column, label, sort, q, className }: { column: SortKey; label: string; sort: Sort; q: string; className?: string }) {
  const active = sort.key === column;
  const dir = active ? (sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir(column);
  const params = new URLSearchParams({ ...(q && { q }), sort: column, dir });
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={`/?${params}`} className="inline-flex items-center gap-1 hover:underline">
        {label}
        <Icon className={`size-3.5 ${active ? '' : 'opacity-30'}`} aria-hidden />
      </Link>
    </TableHead>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; dir?: string }> }) {
  const { q = '', ...params } = await searchParams;
  const sort = parseSort(params.sort, params.dir);
  const g = await getGoogle();
  const { rows, failed } = await syncIndex(g, await requireIds(g));
  const needle = q.trim().toLowerCase();
  const matching = needle
    ? rows.filter((r) => [r.invoice.number, r.invoice.clientName, r.title].some((s) => s?.toLowerCase().includes(needle)))
    : rows;
  const shown = sortRows(matching, sort);

  return (
    <div className="space-y-6">
      <header className="mb-10">
        <h1 className="mb-4 text-[clamp(2.8rem,9vw,5.5rem)] leading-[0.92] font-black tracking-[-0.03em]">Invoices</h1>
        <p className="border-l-[2.5px] border-foreground/20 pl-3 text-xs font-semibold tracking-[0.12em] text-foreground/40 uppercase">
          {rows.length} invoices · Google Drive · Barcelona
        </p>
      </header>
      <SyncWarning failed={failed.length} consequence="They are shown as they were at the last successful sync." />
      <div className="flex items-center gap-2">
        <form className="flex flex-1 gap-2">
          <Input name="q" defaultValue={q} placeholder="Search number or client" />
          <input type="hidden" name="sort" value={sort.key} />
          <input type="hidden" name="dir" value={sort.dir} />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Link className={buttonVariants({ variant: 'outline' })} href="/">Sync</Link>
        <Link className={buttonVariants()} href="/invoices/new">New invoice</Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column="number" label="Number" sort={sort} q={q} />
            <SortableHead column="client" label="Client" sort={sort} q={q} />
            <SortableHead column="date" label="Date" sort={sort} q={q} />
            <SortableHead column="total" label="Total" sort={sort} q={q} className="text-right" />
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.fileId}>
              <TableCell><Link className="underline" href={`/invoices/${r.fileId}`}>{r.invoice.number ?? '—'}</Link></TableCell>
              <TableCell>{r.invoice.clientName}</TableCell>
              <TableCell>{r.invoice.issueDate ?? '—'}</TableCell>
              <TableCell className="text-right">{r.invoice.total == null ? '—' : formatMoney(r.invoice.total, r.invoice.currency)}</TableCell>
              <TableCell className="space-x-3 text-right whitespace-nowrap">
                <a className="underline" href={sheetUrl(r.fileId)} target="_blank">Sheet ↗</a>
                <a className="underline" href={`/api/invoices/${r.fileId}/pdf`}>PDF ⬇</a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!shown.length && <p className="text-sm text-muted-foreground">No invoices match.</p>}
    </div>
  );
}
