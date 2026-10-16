'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, dayMonth, money } from '@/lib/dashboard/format';
import { AXIS } from '@/app/dashboard/charts/common';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dash?: string;
}

export type ChartRow = { date: string } & Record<string, number | string | null>;

const shortDate = (d: unknown) => {
  const s = String(d);
  return `${dayMonth(s)} ${s.slice(2, 4)}`;
};

/**
 * You (solid, dashed where approximate) against the legends, all on the same new-money flows.
 * Chips toggle series so the chart never has to show seven lines at once.
 */
export function LegendsChart({ data, series, defaultOn }: { data: ChartRow[]; series: ChartSeries[]; defaultOn: string[] }) {
  const [on, setOn] = useState(() => new Set(defaultOn));
  const toggle = (k: string) => setOn((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
  config.youApprox = { label: 'You (approx.)', color: 'var(--chart-1)' };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-foreground/50 px-2.5 py-1 text-xs">
          <span className="size-2 rounded-full" style={{ background: 'var(--chart-1)' }} />
          You
        </span>
        {series.filter((s) => s.key !== 'you').map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            aria-pressed={on.has(s.key)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on.has(s.key) ? 'border-foreground/50' : 'border-foreground/10 text-foreground/40'}`}
          >
            <span className="size-2 rounded-full" style={{ background: s.color, opacity: on.has(s.key) ? 1 : 0.3 }} />
            {s.label}
          </button>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <LineChart data={data} margin={{ top: 8, left: 0, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...AXIS} />
          <YAxis tickFormatter={(v: number) => compactMoney(v, 'EUR')} width={64} {...AXIS} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(l) => shortDate(l)} formatter={(v, name) => (
              <div className="flex w-full items-center gap-2">
                <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                <span className="ml-auto pl-3 font-mono tabular-nums text-foreground">{money(Number(v), 'EUR')}</span>
              </div>
            )} />}
          />
          <Line dataKey="youApprox" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="you" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          {series.filter((s) => s.key !== 'you' && on.has(s.key)).map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
