'use client';

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { RevenueData } from '@/lib/dashboard/business';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

export function RevenueChart({ data, ccy }: { data: RevenueData; ccy: DisplayCurrency }) {
  const config: ChartConfig = {
    ...Object.fromEntries(data.series.map((s) => [s.slot, { label: s.name, color: SERIES[s.slot] }])),
    lastYear: { label: 'Same month last year', color: 'var(--chart-5)' },
  };
  const top = data.series.at(-1)?.slot;
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart data={data.months} margin={{ top: 8, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1" />} />
        {data.series.map((s) => (
          <Bar
            key={s.slot}
            dataKey={s.slot}
            stackId="revenue"
            fill={`var(--color-${s.slot})`}
            stroke="var(--chart-gap)"
            strokeWidth={2}
            maxBarSize={24}
            radius={s.slot === top ? [4, 4, 0, 0] : 0}
          />
        ))}
        <Line dataKey="lastYear" type="monotone" stroke="var(--color-lastYear)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
