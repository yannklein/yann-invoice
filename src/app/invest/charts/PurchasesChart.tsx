'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from '@/app/dashboard/charts/common';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { PurchaseMonth } from '@/lib/invest/purchases';

const COLORS = [SERIES.s1, SERIES.s2, SERIES.s3, SERIES.s4, SERIES.other];

/** Euros spent on buys each month, stacked by fund; empty months stay so the timing shows. */
export function PurchasesChart({ months, symbols }: { months: PurchaseMonth[]; symbols: string[] }) {
  const config: ChartConfig = Object.fromEntries(symbols.map((s, i) => [s, { label: s, color: COLORS[Math.min(i, COLORS.length - 1)] }]));
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={months} margin={{ top: 8, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} minTickGap={16} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, 'EUR')} width={60} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, 'EUR')} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1" />} />
        {symbols.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="buys"
            fill={`var(--color-${s})`}
            stroke="var(--chart-gap)"
            strokeWidth={2}
            maxBarSize={24}
            radius={i === symbols.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
