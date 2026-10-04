import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readIndex } from '@/lib/index/store';
import { COUNTRIES } from '@/lib/invoice/countries';
import { effectiveCountry } from '@/lib/invoice/derive';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney, roundMoney } from '@/lib/invoice/totals';

const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGoogle();
  const ids = await requireIds(g);
  const row = (await readIndex(g.sheets, ids.indexId)).find((r) => r.fileId === id);
  if (!row) notFound();
  const inv = row.invoice;
  const money = (n: number | null) => (n == null ? '—' : formatMoney(n, inv.currency));
  const country = effectiveCountry(row);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-3xl font-black tracking-tight">Invoice {inv.number ?? row.title}</h1>
        <a className={buttonVariants({ variant: 'outline' })} href={sheetUrl(id)} target="_blank">Open in Sheets ↗</a>
        <a className={buttonVariants()} href={`/api/invoices/${id}/pdf`}>Download PDF</a>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Client</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {inv.clientLines.map((l, i) => <div key={i}>{l}</div>)}
            <div className="mt-2 text-muted-foreground">{COUNTRIES[country] ?? country}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Issue date: {inv.issueDate ?? '—'}</div>
            <div>Terms: {inv.terms ?? '—'}</div>
            <div>Currency: {inv.currency}</div>
          </CardContent>
        </Card>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>
          {inv.items.map((it, i) => (
            <TableRow key={i}>
              <TableCell className="whitespace-normal">{it.description}</TableCell>
              <TableCell className="text-right">{it.quantity}</TableCell>
              <TableCell className="text-right">{money(it.unitPrice)}</TableCell>
              <TableCell className="text-right">{money(it.quantity * it.unitPrice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="ml-auto w-72 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
        {inv.irpfRate > 0 && inv.subtotal != null && (
          <div className="flex justify-between"><span>IRPF ({pct(inv.irpfRate)})</span><span>−{money(roundMoney(inv.subtotal * inv.irpfRate, inv.currency))}</span></div>
        )}
        <div className="flex justify-between"><span>VAT rate</span><span>{pct(inv.vatRate)}</span></div>
        {inv.withholdingRate > 0 && <div className="flex justify-between"><span>Withholding</span><span>{pct(inv.withholdingRate)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Total</span><span>{money(inv.total)}</span></div>
      </div>
      <Card>
        <CardHeader><CardTitle>Notes &amp; bank</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>{inv.notes.map((n, i) => <div key={i}>{n}</div>)}</div>
          <div className="text-muted-foreground">{inv.bankLines.map((l, i) => <div key={i}>{l}</div>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
