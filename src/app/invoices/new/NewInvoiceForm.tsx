'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRIES } from '@/lib/invoice/countries';
import type { BankAccount, ClientProfile } from '@/lib/invoice/derive';
import { isDuplicate, nextNumber } from '@/lib/invoice/numbering';
import { draftSchema, splitLines, type DraftForm } from '@/lib/invoice/schema';
import { taxRulesFor } from '@/lib/invoice/taxRules';
import { computeTotals, formatMoney } from '@/lib/invoice/totals';
import { CURRENCIES, type Settings } from '@/lib/invoice/types';
import { createInvoiceAction } from './actions';

interface Props {
  clients: ClientProfile[];
  banks: BankAccount[];
  numbers: (string | null)[];
  settings: Settings;
  today: string;
}

const NEW = '__new__';
const selectCls = 'h-8 w-full rounded-lg border border-input bg-input/30 px-2.5 text-sm';
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

export function NewInvoiceForm({ clients, banks, numbers, settings, today }: Props) {
  const [clientKey, setClientKey] = useState(NEW);
  const [bankKey, setBankKey] = useState(banks[0]?.key ?? NEW);
  const [numberEdited, setNumberEdited] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<DraftForm>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      number: nextNumber(numbers, today), issueDate: today, terms: settings.defaultTerms,
      clientLinesText: '', country: '', serviceType: 'teaching', currency: 'EUR', withholdingPercent: 0,
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
      notesText: '', bankLinesText: banks[0]?.lines.join('\n') ?? '',
    },
  });
  const items = useFieldArray({ control, name: 'items' });
  const w = useWatch({ control });

  const tax = useMemo(
    () => taxRulesFor({
      country: w.country || 'unknown',
      serviceType: w.serviceType ?? 'teaching',
      withholdingRate: (Number(w.withholdingPercent) || 0) / 100,
      clientLines: splitLines(w.clientLinesText ?? ''),
    }, settings),
    [w.country, w.serviceType, w.withholdingPercent, w.clientLinesText, settings],
  );

  // Notes follow the tax rule; any edits are kept until the rule changes.
  const ruleNotes = tax.notes.join('\n');
  useEffect(() => setValue('notesText', ruleNotes), [ruleNotes, setValue]);

  // The number follows the issue month until it is edited by hand.
  useEffect(() => {
    if (!numberEdited && /^\d{4}-\d{2}-\d{2}$/.test(w.issueDate ?? '')) setValue('number', nextNumber(numbers, w.issueDate!));
  }, [w.issueDate, numberEdited, numbers, setValue]);

  const currency = w.currency ?? 'EUR';
  const totals = computeTotals(
    (w.items ?? []).map((i) => ({ description: '', quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0 })),
    tax,
    currency,
  );
  const duplicate = isDuplicate(numbers, w.number ?? '');

  function pickBank(key: string) {
    setBankKey(key);
    setValue('bankLinesText', banks.find((b) => b.key === key)?.lines.join('\n') ?? '');
  }

  function pickClient(key: string) {
    setClientKey(key);
    const c = clients.find((x) => x.key === key);
    if (!c) {
      setValue('clientLinesText', '');
      setValue('country', '');
      setValue('withholdingPercent', 0);
      return;
    }
    setValue('clientLinesText', c.lines.join('\n'));
    setValue('country', c.country === 'unknown' ? '' : c.country);
    setValue('currency', c.currency);
    setValue('terms', c.terms || settings.defaultTerms);
    setValue('serviceType', c.serviceType);
    setValue('withholdingPercent', +(c.withholdingRate * 100).toFixed(4));
    const bank = banks.find((b) => b.key === c.bankLines.join('\n'));
    if (bank) pickBank(bank.key);
  }

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setServerError(null);
      const res = await createInvoiceAction(values);
      if (res?.error) setServerError(res.error);
    }),
  );

  const err = (msg?: string) => (msg ? <p className="text-xs text-destructive">{msg}</p> : null);

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <h1 className="text-3xl font-black tracking-tight">New invoice</h1>

      <section className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="number">Number</Label>
          <Input id="number" {...register('number', { onChange: () => setNumberEdited(true) })} />
          {duplicate && <p className="text-xs text-amber-400">This number is already used.</p>}
          {err(errors.number?.message)}
        </div>
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" type="date" {...register('issueDate')} />
          {err(errors.issueDate?.message)}
        </div>
        <div>
          <Label htmlFor="terms">Terms</Label>
          <Input id="terms" {...register('terms')} />
          {err(errors.terms?.message)}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="client">Client</Label>
          <select id="client" className={selectCls} value={clientKey} onChange={(e) => pickClient(e.target.value)}>
            <option value={NEW}>New client…</option>
            {clients.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <Textarea rows={6} placeholder={'Company name\nVAT / tax ID\nStreet\nPostcode City, Country'} {...register('clientLinesText')} />
          {err(errors.clientLinesText?.message)}
        </div>
        <div className="grid content-start gap-3">
          <div>
            <Label htmlFor="country">Country</Label>
            <select id="country" className={selectCls} {...register('country')}>
              <option value="">Select…</option>
              {Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            {err(errors.country?.message)}
          </div>
          {w.country === 'ES' && (
            <div>
              <Label htmlFor="serviceType">Service</Label>
              <select id="serviceType" className={selectCls} {...register('serviceType')}>
                <option value="teaching">Teaching (IVA exempt, art. 20.1.9º)</option>
                <option value="other">Other service (IVA 21%)</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select id="currency" className={selectCls} {...register('currency')}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="withholdingPercent">Withholding (%)</Label>
              <Input id="withholdingPercent" type="number" step="0.01" {...register('withholdingPercent', { valueAsNumber: true })} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label>Items</Label>
        {items.fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_6rem_8rem_auto] gap-2">
            <Input placeholder="Description" {...register(`items.${i}.description`)} />
            <Input type="number" step="0.01" placeholder="Qty" {...register(`items.${i}.quantity`, { valueAsNumber: true })} />
            <Input type="number" step="0.01" placeholder="Unit price" {...register(`items.${i}.unitPrice`, { valueAsNumber: true })} />
            <Button type="button" variant="ghost" disabled={items.fields.length === 1} onClick={() => items.remove(i)}>✕</Button>
          </div>
        ))}
        {err(errors.items?.message ?? errors.items?.root?.message)}
        <Button type="button" variant="outline" disabled={items.fields.length >= 8} onClick={() => items.append({ description: '', quantity: 1, unitPrice: 0 })}>
          Add item
        </Button>
        <div className="ml-auto w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
          {tax.irpfRate > 0 && <div className="flex justify-between"><span>IRPF ({pct(tax.irpfRate)})</span><span>−{formatMoney(totals.irpf, currency)}</span></div>}
          <div className="flex justify-between"><span>VAT ({pct(tax.vatRate)})</span><span>{formatMoney(totals.vat, currency)}</span></div>
          {tax.withholdingRate > 0 && <div className="flex justify-between"><span>Withholding ({pct(tax.withholdingRate)})</span><span>−{formatMoney(totals.withholding, currency)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notesText">Notes</Label>
          <Textarea id="notesText" rows={5} {...register('notesText')} />
          {tax.warnings.map((m) => <p key={m} className="text-xs text-amber-400">{m}</p>)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank">Bank account</Label>
          <select id="bank" className={selectCls} value={bankKey} onChange={(e) => pickBank(e.target.value)}>
            {banks.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            <option value={NEW}>New account…</option>
          </select>
          <Textarea rows={5} placeholder={'Name: YANN LUC KLEIN\nBank name: …\nBIC/SWIFT Code : …\nIBAN: …'} {...register('bankLinesText')} />
          {err(errors.bankLinesText?.message)}
        </div>
      </section>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invoice'}</Button>
    </form>
  );
}
