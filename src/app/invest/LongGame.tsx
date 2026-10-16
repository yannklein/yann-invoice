'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { project } from '@/lib/invest/projection';
import { savePerBuyAction } from './actions';

const eur = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(x);
const HORIZONS = [10, 20, 30, 40];

interface Props {
  perBuyEur: number;
  buysPerYear: number;
  realReturn: number;
  startEur: number;
  buffettYears: number | null;
}

/** Per-buy slider → value in today's euros at 10/20/30/40 years; Save makes it the plan amount. */
export function LongGame({ perBuyEur, buysPerYear, realReturn, startEur, buffettYears }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(perBuyEur);
  const [pending, start] = useTransition();
  const o = { startEur, perBuyEur: amount, buysPerYear, realReturn };
  const values = project(o, HORIZONS);
  const buffett = buffettYears ? project(o, [buffettYears])[0].valueEur : null;
  const yearly = amount * buysPerYear;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="per-buy" className="eyebrow">Per buy · {buysPerYear}× a year</label>
          <p className="text-2xl font-black tabular-nums">{eur(amount)} <span className="text-xs font-normal text-foreground/50">= {eur(yearly)}/yr</span></p>
        </div>
        <input id="per-buy" type="range" min={0} max={30000} step={250} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-[var(--chart-1)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {values.map((v) => (
          <div key={v.years} className="rounded-lg border border-foreground/10 p-3">
            <p className="eyebrow">In {v.years} years</p>
            <p className="text-lg font-black tabular-nums">{eur(v.valueEur)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-foreground/50">
        Today&apos;s euros (inflation removed), assuming {(realReturn * 100).toFixed(1)}% real return a year for your mix. Markets won&apos;t be this smooth.
      </p>
      {buffett !== null && (
        <p className="text-sm">At Buffett&apos;s age (96) you&apos;d have <b>{eur(buffett)}</b>. He&apos;d call it a promising start.</p>
      )}
      <Button disabled={pending || amount === perBuyEur} onClick={() => start(async () => { await savePerBuyAction(amount); router.refresh(); })}>
        {amount === perBuyEur ? 'This is the plan' : `Save ${eur(amount)} as the plan`}
      </Button>
    </div>
  );
}
