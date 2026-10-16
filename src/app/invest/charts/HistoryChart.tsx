'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { compactMoney, dayMonth, money } from '@/lib/dashboard/format';
import { AXIS } from '@/app/dashboard/charts/common';

export interface HistoryPoint {
  date: string;
  you: number | null;
  youApprox: number | null;
  invested: number;
}

const shortDate = (d: unknown) => {
  const s = String(d);
  return `${dayMonth(s)} ${s.slice(2, 4)}`;
};

/** Portfolio value over time (dashed while approximate) above the new money put in. */
export function HistoryChart({ data }: { data: HistoryPoint[] }) {
  const config: ChartConfig = {
    you: { label: 'Value', color: 'var(--chart-1)' },
    youApprox: { label: 'Value (approx.)', color: 'var(--chart-1)' },
    invested: { label: 'New money in', color: 'var(--chart-muted)' },
  };
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ top: 8, left: 0, right: 8 }}>
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
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="invested" type="stepAfter" stroke="var(--chart-muted)" strokeWidth={2} fill="none" isAnimationActive={false} />
        <Area dataKey="youApprox" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="4 4" fill="var(--chart-1)" fillOpacity={0.08} connectNulls isAnimationActive={false} />
        <Area dataKey="you" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.15} connectNulls isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}
