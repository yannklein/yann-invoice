import { buildSnapshot } from '@/lib/advisor/snapshot';
import { parseCcy, todayDate } from '@/lib/dashboard/period';
import { getGoogle } from '@/lib/google/client';
import { CopyButton } from './CopyButton';

export default async function SnapshotPage({ searchParams }: { searchParams: Promise<{ ccy?: string }> }) {
  const { ccy } = await searchParams;
  const g = await getGoogle();
  const text = await buildSnapshot(g, todayDate(), parseCcy(ccy), { sync: true });
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-[clamp(2.4rem,8vw,4.5rem)] leading-[0.92] font-black tracking-[-0.03em]">Snapshot</h1>
        <p className="text-sm text-foreground/60">
          Everything in this app as one Markdown text. Paste it into Claude and ask for a review, or connect Claude to <code>/api/mcp</code> to read it live.
        </p>
        <CopyButton text={text} />
      </header>
      <pre className="overflow-x-auto rounded-lg border border-foreground/10 p-4 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
    </div>
  );
}
