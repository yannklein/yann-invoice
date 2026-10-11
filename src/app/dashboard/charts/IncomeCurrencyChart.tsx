'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { IncomeCurrencyPoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

/** Income by arrival currency on top, the month's ¥/€ rate below on the same month axis (two charts, never two y-axes). */
export function IncomeCurrencyChart({ points, ccy }: { points: IncomeCurrencyPoint[]; ccy: DisplayCurrency }) {
  const config: ChartConfig = {
    fromJpy: { label: 'Arrived in ¥', color: SERIES.s1 },
    fromEur: { label: 'Arrived in €', color: SERIES.s2 },
    fx: { label: '¥ per €', color: SERIES.s3 },
  };
  return (
    <div className="space-y-1">
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <BarChart data={points} margin={{ top: 8, left: 0, right: 0 }} syncId="household-income">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
          <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1" />} />
          <Bar dataKey="fromJpy" stackId="income" fill="var(--color-fromJpy)" stroke="var(--chart-gap)" strokeWidth={2} maxBarSize={24} />
          <Bar dataKey="fromEur" stackId="income" fill="var(--color-fromEur)" stroke="var(--chart-gap)" strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <ChartContainer config={config} className="aspect-auto h-28 w-full">
        <LineChart data={points} margin={{ top: 8, left: 0, right: 0 }} syncId="household-income">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
          <YAxis domain={['auto', 'auto']} width={60} {...AXIS} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} />} />
          <Line dataKey="fx" type="monotone" stroke="var(--color-fx)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-gap)', fill: 'var(--color-fx)' }} />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-foreground/50">Lower: ¥ per € each month (ECB rate saved with the month).</p>
    </div>
  );
}
