import type { Ccy } from './types';

export interface ParsedStatement {
  account: string;
  period: { from: string; to: string } | null;
  /** Stock/ETF executions. `commission` is positive. */
  trades: { dateTime: string; date: string; symbol: string; currency: Ccy; quantity: number; price: number; proceeds: number; commission: number }[];
  /** Position transfers; quantity is negative for "Out". */
  transfers: { date: string; symbol: string; currency: Ccy; quantity: number; marketValue: number; counterparty: string }[];
  deposits: { date: string; currency: Ccy; amount: number; description: string }[];
  dividends: { date: string; symbol: string; isin: string; currency: Ccy; amount: number }[];
  /** Forex trades (e.g. AutoFX EUR.USD): counted, not imported. */
  conversions: number;
  instruments: Record<string, { isin: string; exchange: string; name: string }>;
  endingPositions: Record<string, number>;
  endingCashEur: number | null;
  /** Data lines of a handled section that could not be parsed. */
  skipped: string[];
}

/** One CSV line → fields (double-quoted fields may hold commas; "" is an escaped quote). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "January 1, 2026" → 2026-01-01 (no Date parsing, so no time-zone drift). */
function longDate(s: string): string | null {
  const m = s.trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${pad(month + 1)}-${pad(Number(m[2]))}` : null;
}

const number = (s: string | undefined) => {
  const t = (s ?? '').replace(/,/g, '').trim();
  return t === '' ? NaN : Number(t);
};
const isCcy = (s: string | undefined): s is Ccy => s === 'EUR' || s === 'USD' || s === 'JPY';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const HANDLED = new Set(['Trades', 'Transfers', 'Deposits & Withdrawals', 'Dividends', 'Open Positions', 'Forex Balances', 'Financial Instrument Information']);

/** IBKR Activity Statement CSV → the rows the invest planner needs. Each section's columns come from its latest Header line. */
export function parseIbkrCsv(text: string): ParsedStatement {
  const out: ParsedStatement = {
    account: '', period: null, trades: [], transfers: [], deposits: [], dividends: [],
    conversions: 0, instruments: {}, endingPositions: {}, endingCashEur: null, skipped: [],
  };
  const headers = new Map<string, string[]>();

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const [section, kind] = cells;
    const fields = cells.slice(2);
    if (kind === 'Header') { headers.set(section, fields); continue; }
    const cols = headers.get(section) ?? [];
    const get = (name: string) => fields[cols.indexOf(name)]?.trim() ?? '';

    if (section === 'Statement' && kind === 'Data' && fields[0] === 'Period') {
      const [from, to] = (fields[1] ?? '').split(' - ').map(longDate);
      out.period = from && to ? { from, to } : null;
      continue;
    }
    if (section === 'Account Information' && kind === 'Data' && fields[0] === 'Account') { out.account = fields[1] ?? ''; continue; }
    if (section === 'Forex Balances' && kind === 'Data' && fields[0] === 'Total') { out.endingCashEur = number(get('Value in EUR')); continue; }
    if (kind !== 'Data' || !HANDLED.has(section)) continue;

    const ok = parseRow(section, get, out);
    if (!ok) out.skipped.push(line);
  }
  if (out.endingCashEur !== null && !Number.isFinite(out.endingCashEur)) out.endingCashEur = null;
  return out;
}

/** One Data row of a handled section; false when it should have parsed but did not. Total-like rows return true (ignored). */
function parseRow(section: string, get: (name: string) => string, out: ParsedStatement): boolean {
  switch (section) {
    case 'Trades': {
      if (get('Asset Category') === 'Forex') { out.conversions++; return true; }
      const dateTime = get('Date/Time').replace(', ', ' ');
      const [currency, quantity, price, proceeds, comm] = [get('Currency'), number(get('Quantity')), number(get('T. Price')), number(get('Proceeds')), number(get('Comm/Fee'))];
      const date = dateTime.slice(0, 10);
      if (!DATE.test(date) || !get('Symbol') || !isCcy(currency) || ![quantity, price, proceeds, comm].every(Number.isFinite)) return false;
      out.trades.push({ dateTime, date, symbol: get('Symbol'), currency, quantity, price, proceeds, commission: Math.abs(comm) });
      return true;
    }
    case 'Transfers': {
      if (get('Asset Category').startsWith('Total') || !get('Symbol')) return true;
      const [currency, date, qty, mv] = [get('Currency'), get('Date'), number(get('Qty')), number(get('Market Value'))];
      if (!DATE.test(date) || !isCcy(currency) || !Number.isFinite(qty) || !Number.isFinite(mv)) return false;
      const sign = get('Direction') === 'Out' ? -1 : 1;
      out.transfers.push({ date, symbol: get('Symbol'), currency, quantity: sign * Math.abs(qty), marketValue: mv, counterparty: get('Xfer Account') });
      return true;
    }
    case 'Deposits & Withdrawals': {
      const currency = get('Currency');
      if (currency.startsWith('Total')) return true;
      const [date, amount] = [get('Settle Date'), number(get('Amount'))];
      if (!DATE.test(date) || !isCcy(currency) || !Number.isFinite(amount)) return false;
      out.deposits.push({ date, currency, amount, description: get('Description') });
      return true;
    }
    case 'Dividends': {
      const currency = get('Currency');
      if (currency.startsWith('Total')) return true;
      const m = get('Description').match(/^([A-Z0-9.]+)\(([A-Z0-9]{12})\)/);
      const [date, amount] = [get('Date'), number(get('Amount'))];
      if (!m || !DATE.test(date) || !isCcy(currency) || !Number.isFinite(amount)) return false;
      out.dividends.push({ date, symbol: m[1], isin: m[2], currency, amount });
      return true;
    }
    case 'Open Positions': {
      if (get('DataDiscriminator') !== 'Summary') return true;
      const q = number(get('Quantity'));
      if (!get('Symbol') || !Number.isFinite(q)) return false;
      out.endingPositions[get('Symbol')] = q;
      return true;
    }
    case 'Financial Instrument Information': {
      if (!get('Symbol')) return false;
      out.instruments[get('Symbol')] = { isin: get('Security ID'), exchange: get('Listing Exch'), name: get('Description') };
      return true;
    }
    default:
      return true; // Forex Balances data rows: only the Total row is used
  }
}
