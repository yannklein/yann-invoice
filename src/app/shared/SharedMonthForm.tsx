'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sheetUrl } from '@/lib/invoice/pdf';
import { formatMoney } from '@/lib/invoice/totals';
import { instalmentAmount, totals } from '@/lib/shared/model';
import { monthFormSchema, type LineForm, type MonthForm } from '@/lib/shared/schema';
import { LINE_CURRENCIES, type Kind, type LineCurrency } from '@/lib/shared/types';
import { saveMonthAction } from './actions';

export interface Candidate {
  fileId: string;
  label: string;
  amount: number;
  currency: LineCurrency;
  month: string;
  client: string;
  number: string;
}

interface Props {
  initial: MonthForm;
  saved: boolean;
  updatedAt: string | null;
  fxSource: string;
  candidates: Candidate[];
}

const selectCls = 'h-8 rounded-lg border border-input bg-input/30 px-2 text-sm';
const blank = (kind: Kind): LineForm => ({ kind, label: '', amount: 0, currency: kind === 'income' ? 'EUR' : 'JPY', invoiceId: null, inst: null, note: '' });

export function SharedMonthForm({ initial, saved, updatedAt, fxSource, candidates }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, control, setValue, getValues, handleSubmit, reset, formState: { errors, isDirty } } = useForm<MonthForm>({
    resolver: zodResolver(monthFormSchema),
    defaultValues: initial,
  });
  const lines = useFieldArray({ control, name: 'lines' });
  const w = useWatch({ control });
  const watched = (w.lines ?? []) as Partial<LineForm>[];
  const fx = Number(w.fxJpyPerEur) || 0;
  const t = totals(
    watched.map((l) => ({ month: initial.month, kind: l?.kind ?? 'expense', label: '', amount: Number(l?.amount) || 0, currency: l?.currency ?? 'JPY', invoiceId: null, inst: null, note: '' })),
    fx,
  );

  // Warn before leaving with unsaved edits (a draft month counts as unsaved).
  const unsaved = isDirty || !saved;
  useEffect(() => {
    if (!unsaved) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [unsaved]);

  function toggleInvoice(c: Candidate) {
    const i = getValues('lines').findIndex((l) => l.invoiceId === c.fileId);
    if (i >= 0) lines.remove(i);
    else lines.append({ kind: 'income', label: c.label, amount: c.amount, currency: c.currency, invoiceId: c.fileId, inst: null, note: '' });
  }

  function syncInstalment(i: number) {
    const inst = getValues(`lines.${i}.inst`);
    if (inst && inst.total > 0 && inst.count >= 1) setValue(`lines.${i}.amount`, instalmentAmount(inst, getValues(`lines.${i}.currency`)), { shouldDirty: true });
  }

  function split(i: number, on: boolean) {
    const amount = Number(getValues(`lines.${i}.amount`)) || 0;
    setValue(`lines.${i}.inst`, on ? { total: amount, index: 1, count: 3 } : null, { shouldDirty: true });
    if (on) syncInstalment(i);
  }

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setServerError(null);
      const res = await saveMonthAction(values);
      if ('error' in res) return setServerError(res.error);
      reset(values);
      router.refresh();
    }),
  );

  const err = (msg?: string) => (msg ? <p className="text-xs text-destructive">{msg}</p> : null);
  const money = (x: number, c: LineCurrency) => formatMoney(x, c);
  const linked = new Set(watched.map((l) => l?.invoiceId).filter(Boolean));

  const section = (kind: Kind, title: string) => (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground/60 uppercase">{title}</h2>
        <span className="text-sm text-foreground/60">
          {money(t.byCurrency[kind].JPY, 'JPY')} + {money(t.byCurrency[kind].EUR, 'EUR')} = <b className="text-foreground">{money(kind === 'income' ? t.incomeJpy : t.expenseJpy, 'JPY')}</b>
        </span>
      </div>
      {lines.fields.map((f, i) => {
        if (f.kind !== kind) return null;
        const l = watched[i];
        const e = errors.lines?.[i];
        return (
          <div key={f.id} className="space-y-1 rounded-lg border border-foreground/10 p-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[1fr_9rem_5rem_1fr_auto]">
              <Input aria-label="Label" placeholder="Label" {...register(`lines.${i}.label`)} />
              <Button type="button" variant="ghost" className="md:order-last" aria-label="Delete line" onClick={() => lines.remove(i)}>✕</Button>
              <Input aria-label="Amount" type="number" step="any" className="text-right" {...register(`lines.${i}.amount`, { valueAsNumber: true })} />
              <select aria-label="Currency" className={selectCls} {...register(`lines.${i}.currency`, { onChange: () => syncInstalment(i) })}>
                {LINE_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <Input aria-label="Note" placeholder="Note" className="col-span-2 md:col-span-1" {...register(`lines.${i}.note`)} />
            </div>
            {err(e?.label?.message ?? e?.amount?.message)}
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              {l?.invoiceId && <a className="underline" href={sheetUrl(l.invoiceId)} target="_blank">Invoice ↗</a>}
              {l?.currency === 'EUR' && fx > 0 && <span>≈ {money(Math.round((Number(l.amount) || 0) * fx), 'JPY')}</span>}
              {kind === 'expense' && !l?.inst && <button type="button" className="underline" onClick={() => split(i, true)}>Pay in instalments</button>}
              {kind === 'expense' && l?.inst && (
                <>
                  <span>Total</span>
                  <Input aria-label="Instalment total" type="number" step="any" className="h-7 w-28" {...register(`lines.${i}.inst.total`, { valueAsNumber: true, onChange: () => syncInstalment(i) })} />
                  <span>÷</span>
                  <Input aria-label="Number of instalments" type="number" min={2} className="h-7 w-16" {...register(`lines.${i}.inst.count`, { valueAsNumber: true, onChange: () => syncInstalment(i) })} />
                  <span>· payment</span>
                  <Input aria-label="Payment number" type="number" min={1} className="h-7 w-16" {...register(`lines.${i}.inst.index`, { valueAsNumber: true })} />
                  <span>of {l.inst.count}</span>
                  <button type="button" className="underline" onClick={() => split(i, false)}>Not instalments</button>
                </>
              )}
            </div>
            {err(e?.inst?.index?.message ?? e?.inst?.total?.message ?? e?.inst?.count?.message)}
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={() => lines.append(blank(kind))}>Add {kind}</Button>
    </section>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        {saved ? (
          <Badge variant="secondary">Saved{updatedAt ? ` · ${new Date(updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</Badge>
        ) : (
          <Badge variant="destructive">Draft — not saved</Badge>
        )}
        {saved && isDirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground/60 uppercase">Received from invoices</h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-foreground/50">No unpaid invoices from the last three months.</p>
        ) : (
          <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
            {candidates.map((c) => (
              <li key={c.fileId}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-foreground/5">
                  <input type="checkbox" checked={linked.has(c.fileId)} onChange={() => toggleInvoice(c)} />
                  <span className="w-24 text-foreground/50">{c.number}</span>
                  <span className="flex-1">{c.client}</span>
                  <span className="text-foreground/50">{c.month}</span>
                  <span className="w-32 text-right">{money(c.amount, c.currency)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {section('income', 'Income')}
      {section('expense', 'Expenses')}
      {err(errors.lines?.message ?? errors.lines?.root?.message)}

      <section className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-3">
          <div>
            <Label htmlFor="fx">JPY per EUR <span className="text-foreground/40">({fxSource})</span></Label>
            <Input id="fx" type="number" step="any" className="w-40" {...register('fxJpyPerEur', { valueAsNumber: true })} />
            {err(errors.fxJpyPerEur?.message)}
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Input id="note" {...register('note')} />
          </div>
        </div>
        <div className="space-y-1 rounded-xl border border-foreground/15 bg-card p-4 text-sm">
          <div className="flex justify-between"><span>Income</span><span>{money(t.incomeJpy, 'JPY')}</span></div>
          <div className="flex justify-between"><span>Expenses</span><span>−{money(t.expenseJpy, 'JPY')}</span></div>
          <div className={`flex justify-between border-t border-foreground/15 pt-2 text-lg font-black ${t.transferJpy < 0 ? 'text-destructive' : ''}`}>
            <span>Transfer</span><span>{money(t.transferJpy, 'JPY')}</span>
          </div>
          <div className={`flex justify-end font-semibold ${t.transferJpy < 0 ? 'text-destructive' : 'text-foreground/70'}`}>{money(t.transferEur, 'EUR')}</div>
          {t.transferJpy < 0 && <p className="text-xs text-destructive">Expenses exceed income this month.</p>}
        </div>
      </section>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : saved ? 'Save changes' : 'Save month'}</Button>
    </form>
  );
}
