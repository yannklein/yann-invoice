import { buildFx, type Fx } from '@/lib/dashboard/convert';
import { fetchMonthlyRates } from '@/lib/fx/history';
import type { Google } from '@/lib/google/client';
import { resolveIds } from '@/lib/google/drive';
import { readIndex, readSettings, syncIndex } from '@/lib/index/store';
import { loadInvestView } from '@/lib/invest/load';
import type { Portfolio } from '@/lib/invest/types';
import type { InvestView } from '@/lib/invest/view';
import { sortNewest, type IndexRow } from '@/lib/invoice/derive';
import type { Settings } from '@/lib/invoice/types';
import { currentMonth, invoiceMonth } from '@/lib/shared/model';
import { findSharedId, readShared, type SharedData } from '@/lib/shared/store';

/** Everything the advisor snapshot reads: invoices, settings, the shared account, FX and the invest model. */
export interface FinanceData {
  rows: IndexRow[];
  failed: number; // invoice sheets that could not be re-read (their previous index rows are used)
  settings: Settings;
  shared: SharedData | null;
  fx: Fx;
  invest: { p: Portfolio; v: InvestView } | null;
}

/**
 * Loads all finance data without redirecting (safe outside a page). `sync` re-parses changed invoice sheets into the
 * index first, as the dashboard does; without it the index is only read, so nothing is written.
 */
export async function loadFinance(g: Google, today: string, opts: { sync?: boolean } = {}): Promise<FinanceData> {
  const ids = await resolveIds(g.drive);
  if (!ids) throw new Error('The app is not set up yet: open /settings in the web app first.');
  const [index, settings, shared, invest] = await Promise.all([
    opts.sync ? syncIndex(g, ids) : readIndex(g.sheets, ids.indexId).then((rows) => ({ rows: sortNewest(rows), failed: [] })),
    readSettings(g.sheets, ids.indexId),
    findSharedId(g.drive).then((id) => (id ? readShared(g.sheets, id) : null)),
    loadInvestView(g, today, null),
  ]);
  const oldest = index.rows.length ? index.rows.map(invoiceMonth).sort()[0] : currentMonth();
  const fx = buildFx(await fetchMonthlyRates(oldest, today), shared?.months ?? []);
  return { rows: index.rows, failed: index.failed.length, settings, shared, fx, invest: invest && { p: invest.p, v: invest.v } };
}
