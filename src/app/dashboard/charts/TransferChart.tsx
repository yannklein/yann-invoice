'use client';

import { Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import type { TransferPoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

export function TransferChart({ points, average, ccy }: { points: TransferPoint[]; average: number; ccy: DisplayCurrency }) {
  const config: ChartConfig = { amount: { label: 'Transfer', color: SERIES.s1 } };
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <ComposedChart data={points} margin={{ top: 16, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ReferenceLine
          y={average}
          stroke="var(--chart-muted)"
          strokeDasharray="4 4"
          label={{ value: `avg ${compactMoney(average, ccy)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy)} />} />
        <Bar dataKey="amount" fill="var(--color-amount)" maxBarSize={24} radius={[4, 4, 0, 0]}>
          {points.map((p) => (
            <Cell key={p.month} fill={p.amount < 0 ? 'var(--destructive)' : 'var(--color-amount)'} />
          ))}
        </Bar>
      </ComposedChart>
    </ChartContainer>
  );
}
