'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { confirmUploadAction, previewUploadAction, type UploadPreview } from './actions';

const eur = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(x);

/** Pick an IBKR Activity Statement CSV, preview what it would add, then confirm. */
export function UploadCard() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = async (file: File | undefined) => {
    setPreview(null);
    setMessage(null);
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    start(async () => {
      const r = await previewUploadAction(text);
      if ('error' in r) setMessage(r.error);
      else setPreview(r);
    });
  };
  const confirm = () =>
    start(async () => {
      if (!csv) return;
      const r = await confirmUploadAction(csv);
      if ('error' in r) return setMessage(r.error);
      setMessage(`Imported or corrected ${r.added} rows.`);
      setPreview(null);
      router.refresh();
    });

  const nothingNew = preview && preview.counts.trades + preview.counts.transfers + preview.counts.deposits + preview.counts.dividends + preview.counts.corrections === 0 && preview.counts.currencyEur === 0;
  return (
    <div className="space-y-3 text-sm">
      <label className="eyebrow block">After buying: upload the IBKR Activity Statement (CSV)</label>
      <input type="file" accept=".csv,text/csv" disabled={pending} onChange={(e) => pick(e.target.files?.[0])} className="block text-xs file:mr-3 file:rounded-md file:border file:border-foreground/20 file:bg-transparent file:px-2 file:py-1 file:text-foreground" />
      {pending && <p className="text-foreground/50">Reading…</p>}
      {message && <p className="text-foreground/80">{message}</p>}
      {preview && (
        <div className="space-y-2 rounded-lg border border-foreground/10 p-3">
          <p>
            {preview.account}
            {preview.period && <> · {preview.period.from} → {preview.period.to}</>}
          </p>
          <ul className="list-disc pl-5 text-foreground/80">
            <li>{preview.counts.trades} trades, {preview.counts.transfers} transfers ({preview.duplicates.trades} already in the sheet)</li>
            <li>{preview.counts.deposits} deposits, {preview.counts.newMoneyDeposits} counted as new money ({preview.duplicates.deposits} already in the sheet)</li>
            <li>{preview.counts.dividends} dividends ({preview.duplicates.dividends} already in the sheet)</li>
            {preview.counts.corrections > 0 && <li>{preview.counts.corrections} rows already in the sheet will be corrected (e.g. transferred shares get their original cost)</li>}
            {preview.conversions > 0 && <li>{preview.conversions} currency conversions ignored</li>}
            {preview.counts.newSymbols.length > 0 && <li>New symbols added to the Symbols tab: {preview.counts.newSymbols.join(', ')}</li>}
          </ul>
          {preview.positionMismatches.length > 0 && (
            <p className="text-amber-400">
              Holdings differ from the statement: {preview.positionMismatches.map((m) => `${m.symbol} sheet ${m.sheet} vs statement ${m.statement}`).join('; ')}.
            </p>
          )}
          {preview.counts.currencyEur !== 0 && (
            <p className="text-foreground/70">
              Currency moves and fees booked so cash matches the statement: {eur(preview.counts.currencyEur)}.
            </p>
          )}
          {preview.missingRates && <p className="text-destructive">Exchange rates unavailable — nothing was imported. Try again later.</p>}
          {preview.skipped.length > 0 && (
            <details className="text-amber-400"><summary>{preview.skipped.length} unreadable lines</summary><pre className="overflow-x-auto text-[10px]">{preview.skipped.join('\n')}</pre></details>
          )}
          <Button onClick={confirm} disabled={pending || !!nothingNew || preview.missingRates}>{nothingNew ? 'Nothing new to import' : 'Import'}</Button>
        </div>
      )}
    </div>
  );
}
