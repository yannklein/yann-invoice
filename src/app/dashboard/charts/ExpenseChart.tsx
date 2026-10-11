'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, monthShort } from '@/lib/dashboard/format';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpensePoint } from '@/lib/dashboard/household';
import type { DisplayCurrency } from '@/lib/dashboard/period';
import { AXIS, monthLabelFormatter, moneyRow, SERIES } from './common';

const COLORS = [SERIES.s1, SERIES.s2, SERIES.s3, SERIES.s4, SERIES.other];

export function ExpenseChart({ points, ccy }: { points: ExpensePoint[]; ccy: DisplayCurrency }) {
  const config: ChartConfig = Object.fromEntries(EXPENSE_CATEGORIES.map((c, i) => [c.id, { label: c.label, color: COLORS[i] }]));
  const labelsOf = (key: string, payload: Record<string, unknown>) => (payload.labels as ExpensePoint['labels'])[key as ExpenseCategory]?.join(', ');
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={points} margin={{ top: 8, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...AXIS} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, ccy)} width={60} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={monthLabelFormatter} formatter={moneyRow(config, ccy, labelsOf)} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1" />} />
        {EXPENSE_CATEGORIES.map((c) => (
          <Bar
            key={c.id}
            dataKey={c.id}
            stackId="expenses"
            fill={`var(--color-${c.id})`}
            stroke="var(--chart-gap)"
            strokeWidth={2}
            maxBarSize={24}
            radius={c.id === 'other' ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
