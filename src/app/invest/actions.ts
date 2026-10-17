'use server';

import { revalidatePath } from 'next/cache';
import { fetchDailyRates } from '@/lib/fx/history';
import { getGoogle, type Google } from '@/lib/google/client';
import { parseIbkrCsv } from '@/lib/invest/ibkr';
import { buildImport, type ImportResult } from '@/lib/invest/importPlan';
import { isDate } from '@/lib/invest/rows';
import { addCashRow, appendImport, findPortfolioId, readPortfolio, savePlanValue, sriForNewBuys } from '@/lib/invest/store';

export interface UploadPreview extends Omit<ImportResult, 'trades' | 'deposits' | 'dividends' | 'newSymbols' | 'corrections'> {
  account: string;
  counts: { trades: number; transfers: number; deposits: number; newMoneyDeposits: number; dividends: number; corrections: number; newSymbols: string[]; currencyEur: number };
}

type Failure = { error: string };
const RATES_DOWN = 'Exchange rates unavailable — nothing was imported. Try again later.';

async function prepare(csv: string): Promise<Failure | { g: Google; id: string; result: ImportResult; account: string }> {
  const g = await getGoogle();
  const id = await findPortfolioId(g.drive);
  if (!id) return { error: 'Link the portfolio sheet in Settings first.' };
  const stmt = parseIbkrCsv(csv);
  if (!stmt.account) return { error: 'That file is not an IBKR Activity Statement (CSV).' };
  const portfolio = await readPortfolio(g.sheets, id);
  const foreign = [...stmt.trades, ...stmt.transfers, ...stmt.deposits, ...stmt.dividends, ...stmt.withholding].filter((r) => r.currency !== 'EUR').map((r) => r.date);
  // A closing balance in yen needs that day's rate too.
  if (stmt.baseCurrency && stmt.baseCurrency !== 'EUR' && stmt.period) foreign.push(stmt.period.to);
  foreign.sort();
  const from = foreign.length ? new Date(Date.parse(`${foreign[0]}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10) : null;
  const rates = from ? await fetchDailyRates(from, foreign.at(-1)!) : {};
  return { g, id, result: buildImport(stmt, portfolio, rates), account: stmt.account };
}

export async function previewUploadAction(csv: string): Promise<UploadPreview | Failure> {
  const r = await prepare(csv);
  if ('error' in r) return r;
  const { trades, deposits, dividends, newSymbols, corrections, ...rest } = r.result;
  return {
    ...rest,
    account: r.account,
    counts: {
      trades: trades.filter((t) => t.source === 'ibkr').length,
      transfers: trades.filter((t) => t.source === 'transfer').length,
      deposits: deposits.filter((d) => d.kind !== 'fx').length,
      newMoneyDeposits: deposits.filter((d) => d.kind === 'new').length,
      currencyEur: deposits.filter((d) => d.kind === 'fx').reduce((a, d) => a + d.amountEur, 0),
      dividends: dividends.length,
      corrections: corrections.length,
      newSymbols: newSymbols.map((s) => s.symbol),
    },
  };
}

export async function confirmUploadAction(csv: string): Promise<{ ok: true; added: number } | Failure> {
  const r = await prepare(csv);
  if ('error' in r) return r;
  if (r.result.missingRates) return { error: RATES_DOWN };
  await appendImport(r.g.sheets, r.id, r.result);
  revalidatePath('/invest');
  return { ok: true, added: r.result.trades.length + r.result.deposits.length + r.result.dividends.length + r.result.corrections.length };
}

export async function savePerBuyAction(amount: number): Promise<void> {
  const g = await getGoogle();
  const id = await findPortfolioId(g.drive);
  if (!id || !Number.isFinite(amount)) return;
  await savePlanValue(g.sheets, id, 'perBuyEur', Math.min(30000, Math.max(0, Math.round(amount))));
  revalidatePath('/invest');
}

export async function switchToSriAction(formData: FormData): Promise<void> {
  const g = await getGoogle();
  const id = await findPortfolioId(g.drive);
  if (!id) return;
  await sriForNewBuys(g.sheets, id, String(formData.get('slot') ?? ''));
  revalidatePath('/invest');
}

export async function addCashAction(formData: FormData): Promise<void> {
  const date = String(formData.get('date') ?? '');
  const balance = Number(formData.get('balance'));
  const deposit = Number(formData.get('deposit') || 0);
  if (!isDate(date) || !Number.isFinite(balance) || !Number.isFinite(deposit)) return;
  const g = await getGoogle();
  const id = await findPortfolioId(g.drive);
  if (!id) return;
  await addCashRow(g.sheets, id, { date, deposit, balance, note: String(formData.get('note') ?? '') });
  revalidatePath('/invest');
}
