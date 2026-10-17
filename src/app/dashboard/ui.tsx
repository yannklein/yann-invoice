import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShareRow } from '@/lib/dashboard/business';
import { money, percent } from '@/lib/dashboard/format';
import type { DisplayCurrency } from '@/lib/dashboard/period';

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="eyebrow border-l-[2.5px] border-foreground/20 pl-3 text-foreground/50">{title}</h2>
        {aside && <span className="text-xs text-foreground/50">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Stat({ label, value, sub, warn, good }: { label: string; value: string; sub?: ReactNode; warn?: boolean; good?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <p className={`text-2xl font-black tabular-nums ${warn ? 'text-destructive' : good ? 'text-positive' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-foreground/50">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-foreground/60' : 'border-foreground/10 text-foreground/50 hover:text-foreground'}`}
    >
      {children}
    </Link>
  );
}

export const Empty = ({ children = 'Nothing in this period' }: { children?: ReactNode }) => (
  <p className="py-8 text-center text-sm text-foreground/40">{children}</p>
);

export const NotImported = () => (
  <p className="text-sm text-foreground/60">
    The “Shared account money” sheet is not imported yet. <Link className="underline" href="/settings">Import it in Settings</Link>.
  </p>
);

/** Ranked horizontal bars (one measure, one colour), labelled with share and amount. */
export function ShareBars({ rows, ccy }: { rows: ShareRow[]; ccy: DisplayCurrency }) {
  if (!rows.length) return <Empty />;
  const max = rows[0].amount || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.name}>{r.name}</span>
          <span className="h-2">
            <span className="block h-full rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(1, (r.amount / max) * 100)}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-foreground/60">{percent(r.pct)} · {money(r.amount, ccy)}</span>
        </li>
      ))}
    </ul>
  );
}
