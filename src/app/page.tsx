import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { SyncWarning } from '@/components/SyncWarning';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { syncIndex } from '@/lib/index/store';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney } from '@/lib/invoice/totals';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const g = await getGoogle();
  const { rows, failed } = await syncIndex(g, await requireIds(g));
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.invoice.number, r.invoice.clientName, r.title].some((s) => s?.toLowerCase().includes(needle)))
    : rows;

  return (
    <div className="space-y-4">
      <SyncWarning failed={failed.length} consequence="They are shown as they were at the last successful sync." />
      <div className="flex items-center gap-2">
        <form className="flex flex-1 gap-2">
          <Input name="q" defaultValue={q} placeholder="Search number or client" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Link className={buttonVariants({ variant: 'outline' })} href="/">Sync</Link>
        <Link className={buttonVariants()} href="/invoices/new">New invoice</Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Number</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow>
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
