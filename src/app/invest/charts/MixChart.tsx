'use client';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { moneyRow } from '@/app/dashboard/charts/common';
import { money } from '@/lib/dashboard/format';
import type { MixGroup, MixPart } from '@/lib/invest/mix';

/** One hue per slot in plan order, with a lighter shade for the SRI fund: validated together against the dark chart surface. */
const SHADES: Record<MixPart['shade'], string>[] = [
  { base: '#008a7e', tint: '#34c0b1' },
  { base: '#a8740a', tint: '#dca52c' },
  { base: '#2c6cc8', tint: '#6aa6f2' },
];
const OTHER = { base: 'var(--chart-other)', tint: 'var(--chart-muted)' };

const labelOf = (x: MixPart) => (x.sri ? `${x.label} (SRI)` : x.label);

/** One stacked bar of the money per fund, the funds of a slot side by side under its name and share. */
export function MixChart({ groups }: { groups: MixGroup[] }) {
  const parts = groups.flatMap((g) => g.parts.map((x) => ({ ...x, color: (SHADES[g.index] ?? OTHER)[x.shade] }))).map((x, i) => ({ ...x, key: `p${i}` }));
  const config: ChartConfig = Object.fromEntries(parts.map((x) => [x.key, { label: labelOf(x), color: x.color }]));
  const total = parts.reduce((s, x) => s + x.valueEur, 0);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex gap-0.5 pb-1 text-xs tabular-nums">
          {groups.map((g) => (
            <div key={g.slot} className="min-w-0" style={{ width: `${(g.valueEur / total) * 100}%` }}>
              <p className="truncate text-foreground/80">{g.slot}</p>
              <p className="text-foreground/50">{g.pct}%</p>
            </div>
          ))}
        </div>
        <ChartContainer config={config} className="aspect-auto h-7 w-full">
          <BarChart layout="vertical" data={[Object.fromEntries(parts.map((x) => [x.key, x.valueEur]))]} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={0}>
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis type="category" hide />
            <ChartTooltip shared={false} cursor={false} content={<ChartTooltipContent hideLabel formatter={moneyRow(config, 'EUR')} />} />
            {parts.map((x, i) => (
              <Bar
                key={x.key}
                dataKey={x.key}
                stackId="mix"
                fill={`var(--color-${x.key})`}
                stroke="var(--chart-gap)"
                strokeWidth={2}
                radius={i === 0 ? [4, 0, 0, 4] : i === parts.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-foreground/70">
        {parts.map((x) => (
          <li key={x.key} className="flex items-center gap-1.5" title={x.name}>
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: x.color }} />
            {labelOf(x)} {money(x.valueEur, 'EUR')} · {x.pct}%
          </li>
        ))}
      </ul>
    </div>
  );
}
