import type { ChartConfig } from '@/components/ui/chart';
import { money, monthShort } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';

/** Categorical slots in fixed order; "other" is always the neutral grey. */
export const SERIES = { s1: 'var(--chart-1)', s2: 'var(--chart-2)', s3: 'var(--chart-3)', s4: 'var(--chart-4)', other: 'var(--chart-other)' } as const;

/** Recessive axes: no tick marks or axis lines, the grid carries the scale. */
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

export const monthLabelFormatter = (m: unknown) => monthShort(String(m));

/**
 * Tooltip row: swatch, series label, amount in the display currency, and optional detail (e.g. the expense labels).
 * Zero values are hidden so stacked tooltips only list what is in the bar.
 */
export function moneyRow(config: ChartConfig, ccy: DisplayCurrency, detail?: (key: string, payload: Record<string, unknown>) => string | undefined) {
  return function MoneyRow(value: unknown, name: unknown, item: { color?: string; payload?: Record<string, unknown> }) {
    if (!Number(value)) return null;
    const key = String(name);
    const extra = detail?.(key, item.payload ?? {});
    return (
      <div className="flex w-full flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
          <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
          <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">{money(Number(value), ccy)}</span>
        </div>
        {extra && <span className="pl-4.5 text-[10px] text-muted-foreground">{extra}</span>}
      </div>
    );
  };
}
