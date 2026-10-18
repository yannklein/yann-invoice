import { byClient, byCountry, byService, paymentDelay, revenueByMonth, revenueEntries, shareBy, skippedIn, unpaid, type ShareRow } from '@/lib/dashboard/business';
import { delayLabel, money, percent, signedPercent } from '@/lib/dashboard/format';
import { EXPENSE_CATEGORIES, expenseBreakdown, incomeByCurrency, transfers } from '@/lib/dashboard/household';
import { periodMonths, type DisplayCurrency } from '@/lib/dashboard/period';
import { instalmentsInProgress, nextFiling, taxQuarters } from '@/lib/dashboard/tax';
import type { Google } from '@/lib/google/client';
import { domicileOf } from '@/lib/invest/domicile';
import { holdings } from '@/lib/invest/holdings';
import { project } from '@/lib/invest/projection';
import type { Portfolio } from '@/lib/invest/types';
import type { InvestView } from '@/lib/invest/view';
import { clientKey, effectiveCountry } from '@/lib/invoice/derive';
import { roundMoney } from '@/lib/invoice/totals';
import { invoiceMonth } from '@/lib/shared/model';
import { loadFinance, type FinanceData } from './load';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const eur = (x: number) => money(x, 'EUR');
const eurCents = (x: number) => money(x, 'EUR', true);
const signed = (x: number, c: DisplayCurrency) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), c)}`;
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const cell = (x: unknown) => String(x ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/** A Markdown table; an empty body becomes a one-line note. */
export function table(head: string[], body: unknown[][], empty = '_None._'): string {
  if (!body.length) return empty;
  return [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...body.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

const shares = (rows: ShareRow[], ccy: DisplayCurrency, top = 8) =>
  table(['Name', 'Revenue', 'Share'], rows.slice(0, top).map((r) => [r.name, money(r.amount, ccy), percent(r.pct)]));

export function renderBusiness(d: FinanceData, today: string, ccy: DisplayCurrency): string {
  const now = today.slice(0, 7);
  const year = Number(now.slice(0, 4));
  const months = periodMonths({ kind: '12m' }, now);
  const entries = revenueEntries(d.rows, ccy, d.fx);
  const rev = revenueByMonth(entries, months, ccy);
  const sumOf = (pred: (m: string) => boolean) => roundMoney(entries.filter((e) => pred(e.month)).reduce((a, e) => a + e.amount, 0), ccy);
  const ytd = sumOf((m) => m.startsWith(`${year}-`) && m <= now);
  const ytdBefore = sumOf((m) => m.startsWith(`${year - 1}-`) && m.slice(5) <= now.slice(5));
  const lastYear = sumOf((m) => m.startsWith(`${year - 1}-`));
  const count = entries.filter((e) => months.includes(e.month)).length;
  const skipped = skippedIn(d.rows, months, 'subtotal');
  const out = [
    '## Business (freelance invoices)',
    `Revenue = invoice subtotals before VAT/IRPF, in ${ccy} at each invoice month's ECB rate.`,
    `- Last 12 months: **${money(rev.total, ccy)}** from ${count} invoices (same months a year earlier: ${money(rev.previousTotal, ccy)}${rev.changePct == null ? '' : `, ${signedPercent(rev.changePct)}`})`,
    `- ${year} so far: ${money(ytd, ccy)} (same months of ${year - 1}: ${money(ytdBefore, ccy)}) · all of ${year - 1}: ${money(lastYear, ccy)}`,
    `- Average per month over the last 12: ${money(rev.total / 12, ccy)}`,
    skipped ? `- ${skipped} invoice(s) in the period have no readable subtotal and are left out.` : '',
    '',
    '### Revenue by month',
    table(['Month', 'Revenue', 'Same month last year'], rev.months.map((p) => [p.month, money(p.total, ccy), money(p.lastYear, ccy)])),
    '',
    '### Revenue by client (last 12 months)',
    shares(shareBy(entries, months, ccy, byClient), ccy),
    '',
    '### By country and by service (last 12 months)',
    shares(shareBy(entries, months, ccy, byCountry), ccy),
    '',
    shares(shareBy(entries, months, ccy, byService), ccy),
    '',
    `Default IRPF rate charged to Spanish clients: ${pct(d.settings.irpfRate, 0)} · default terms: ${d.settings.defaultTerms}`,
  ];
  if (d.shared) {
    const open = unpaid(d.rows, d.shared.lines, now, ccy, d.fx);
    out.push(
      '',
      `### Unpaid invoices (tracked since ${open.from}; an invoice counts as paid once a shared-account income line links it)`,
      table(['Number', 'Client', 'Month', 'Total', 'Age'], open.rows.map((u) => [u.number, u.client, u.month, money(u.total, u.currency, true), `${u.ageMonths} mo`]), '_All paid._'),
      open.rows.length ? `Total unpaid: **${money(open.total, ccy)}**` : '',
      '',
      '### Payment delay by client (median, invoice month → month it was received)',
      table(['Client', 'Delay', 'Invoices'], paymentDelay(d.rows, d.shared.lines).map((r) => [r.name, delayLabel(r.months), r.count])),
    );
  }
  return out.filter((l) => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1');
}

export function renderTax(d: FinanceData, today: string, year: number): string {
  const t = taxQuarters(d.rows, year, today, d.fx);
  const body = t.quarters.map((q) => [`Q${q.q}`, q.due, q.status, eurCents(q.base), eurCents(q.vat), eurCents(q.irpf), eurCents(q.withholding)]);
  body.push(['Total', '', '', eurCents(t.total.base), eurCents(t.total.vat), eurCents(t.total.irpf), eurCents(t.total.withholding)]);
  return [
    `### Tax quarters ${year} (EUR)`,
    'Base = invoiced subtotals; VAT = charged on invoices (Modelo 303); IRPF = withheld by Spanish clients (credited in Modelo 130); withholding = tax withheld abroad (double-taxation credit). Business expenses are not tracked, so no net profit.',
    table(['Quarter', 'Due', 'Status', 'Base', 'VAT charged', 'IRPF withheld', 'Foreign withholding'], body),
    t.skipped ? `${t.skipped} invoice(s) of ${year} have no readable subtotal and are left out.` : '',
  ].filter(Boolean).join('\n');
}

export function renderTaxSection(d: FinanceData, today: string): string {
  const year = Number(today.slice(0, 4));
  const next = nextFiling(d.rows, today, d.fx);
  const out = [
    '## Tax (Spain: autónomo, quarterly Modelo 303 VAT and 130 IRPF)',
    `- Next filing: **Q${next.q} ${next.year}**, due ${next.due}${next.status === 'so-far' ? ' (quarter still running, figures so far)' : ''}: base ${eurCents(next.base)}, VAT ${eurCents(next.vat)}, IRPF withheld ${eurCents(next.irpf)}`,
    '',
    renderTax(d, today, year),
    '',
    renderTax(d, today, year - 1),
  ];
  if (d.shared) {
    const inst = instalmentsInProgress(d.shared.months, d.shared.lines);
    out.push('', '### Tax instalments in progress (from the shared account)', table(['Label', 'Payment', 'Amount', 'Remaining after it'], inst.map((i) => [i.label, `${i.index}/${i.count}`, money(i.amount, i.currency), money(i.remaining, i.currency)])));
  }
  return out.join('\n');
}

export function renderHousehold(d: FinanceData, ccy: DisplayCurrency, range: { from?: string; to?: string } = {}): string {
  if (!d.shared) return '## Household (shared account)\n_The shared account is not imported._';
  const all = d.shared.months.map((m) => m.month).sort();
  const picked = all.filter((m) => (!range.from || m >= range.from) && (!range.to || m <= range.to));
  const shown = range.from || range.to ? picked : picked.slice(-12);
  const months = d.shared.months.filter((m) => shown.includes(m.month));
  const lines = d.shared.lines.filter((l) => shown.includes(l.month));
  const tr = transfers(months, lines, ccy);
  const exp = expenseBreakdown(months, lines, ccy);
  const inc = incomeByCurrency(months, lines, ccy);
  const cats = EXPENSE_CATEGORIES.map((c) => c.id);
  // transfers, expenseBreakdown and incomeByCurrency all return one point per month, sorted, so they line up.
  const body = tr.points.map((pt, i) => [
    pt.month, inc[i].fx, money(inc[i].fromJpy + inc[i].fromEur, ccy), ...cats.map((c) => money(exp[i][c], ccy)), money(pt.amount, ccy),
  ]);
  const avg = (c: (typeof cats)[number]) => (exp.length ? exp.reduce((a, p) => a + p[c], 0) / exp.length : 0);
  const latest = shown.at(-1);
  const out = [
    '## Household (shared account)',
    `Each saved month: income received (paid invoices, in JPY and EUR) minus Yann's own expenses (taxes, savings, housing, subscriptions…) = the transfer to the shared household account. Amounts in ${ccy} at each month's saved JPY/EUR rate.`,
    `- Months shown: ${shown.length ? `${shown[0]} → ${latest}` : 'none'} · average transfer: **${money(tr.average, ccy)}**/month`,
    `- Average expenses per month: ${EXPENSE_CATEGORIES.map((c) => `${c.label} ${money(avg(c.id), ccy)}`).join(' · ')}`,
    d.shared.invalidRows ? `- ${d.shared.invalidRows} row(s) of the shared sheet could not be read.` : '',
    '',
    table(['Month', 'JPY per EUR', 'Income', ...EXPENSE_CATEGORIES.map((c) => c.label), 'Transfer'], body, '_No saved months in that range._'),
  ];
  if (latest) {
    out.push(
      '',
      `### Lines of ${latest}`,
      table(['Kind', 'Label', 'Amount', 'Instalment', 'Note'], d.shared.lines.filter((l) => l.month === latest).map((l) => [l.kind, l.label, money(l.amount, l.currency), l.inst ? `${l.inst.index}/${l.inst.count} of ${money(l.inst.total, l.currency)}` : '', l.note])),
    );
  }
  return out.filter((l) => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1');
}

export function renderPortfolio({ p, v }: { p: Portfolio; v: InvestView }, today: string): string {
  const b = v.breakdown;
  const info = new Map(p.symbols.map((s) => [s.symbol, s]));
  const held = holdings(p.trades);
  const quote = new Map(v.quotes.map((q) => [q.symbol, q]));
  const holdingRows = Object.entries(held).map(([s, units]) => {
    const i = info.get(s);
    const q = quote.get(s);
    const dom = domicileOf(i?.isin ?? '');
    return [s, i?.name ?? '', i?.isin ?? '', dom.country ?? '?', i?.terPct == null ? '?' : `${i.terPct}%`, i?.sri ? 'yes' : 'no', units, q ? `${eurCents(q.priceEur)} (${q.date}${q.stale ? ', stale' : ''})` : '?', q ? eur(units * q.priceEur) : '?'];
  });
  const slotRows = v.round.lines.map((l) => {
    const s = p.slots.find((x) => x.slot === l.slot);
    return [l.slot, s?.kind ?? '', `${l.targetPct}%`, `${l.nowPct}%`, l.symbol, s?.sriSymbol ?? '', s?.livret ? 'yes' : 'no', eur(l.buyEur)];
  });
  const g = v.longGame;
  const horizons = [10, 20, 30, ...(g.buffettYears ? [g.buffettYears] : [])];
  const proj = project({ startEur: g.startEur, perBuyEur: g.perBuyEur, buysPerYear: g.buysPerYear, realReturn: g.realReturn }, horizons);
  const age = p.plan.birthYear ? Number(today.slice(0, 4)) - p.plan.birthYear : null;
  const warnings = [
    ...v.quotes.filter((q) => q.stale).map((q) => `${q.symbol}: price from ${q.date}, live quote unavailable`),
    ...(v.missingSeries.length ? [`No price history for ${v.missingSeries.join(', ')}`] : []),
    ...(v.unassigned.length ? [`Held but in no slot: ${v.unassigned.join(', ')}`] : []),
    ...(v.invalidRows ? [`${v.invalidRows} portfolio row(s) could not be read`] : []),
  ];
  return [
    '## Money today (EUR)',
    `- Total: **${eur(b.todayEur)}** = funds ${eur(b.fundsEur)} + IBKR cash ${eurCents(b.ibkrCashEur)} + Livret Bleu ${eur(b.livretEur)}`,
    `- New money put in${b.firstFlowDate ? ` since ${b.firstFlowDate}` : ''}: ${eur(b.newMoneyEur)} → result ${signed(b.resultEur, 'EUR')}${b.newMoneyEur > 0 ? ` (${pct(b.resultEur / b.newMoneyEur)})` : ''}`,
    `- Result split: stock gain ${signed(b.stockGainEur, 'EUR')}${b.stockGainPct == null ? '' : ` (${b.stockGainPct.toFixed(1)}% on cost)`}, dividends ${eur(b.dividendsEur)}, Livret interest ${eur(b.interestEur)}, currency moves and fees ${signed(b.currencyEur, 'EUR')}, earlier accounts ${signed(b.earlierEur, 'EUR')}, other ${signed(b.otherEur, 'EUR')}`,
    v.closed ? `- Closed earlier account (Rakuten, history only, not in today's money): put in ${eur(v.closed.putInEur)} (${v.closed.from} → ${v.closed.to})${v.closed.resultEur == null ? '' : `, paid out ${eur(v.closed.payoutEur!)}, result ${signed(v.closed.resultEur, 'EUR')}`}` : '',
    '',
    '## Portfolio (IBKR ETFs + Livret Bleu)',
    '### Holdings',
    table(['Symbol', 'Name', 'ISIN', 'Domicile', 'TER', 'SRI', 'Units', 'Price', 'Value'], holdingRows),
    '',
    '### Target mix (slots) and this buy round',
    table(['Slot', 'Kind', 'Target', 'Now', 'Buys', 'SRI alternative', 'Livret counts here', 'Next round buy'], slotRows),
    `- Plan: buy in ${p.plan.buyMonths.map((m) => MONTH_NAMES[m - 1]).join(', ') || 'no months set'}, ${eur(p.plan.perBuyEur)} per buy${v.nextBuy ? ` · next buy ${v.nextBuy.date} (in ${v.nextBuy.days} days)` : ''} · next round ${eur(v.round.amountEur)}${v.round.fromCashEur > 0 ? ` (includes ${eurCents(v.round.fromCashEur)} IBKR cash)` : ''}`,
    v.round.driftNote ? '- The mix has drifted more than 10 points from target (the round buys steer it back without selling).' : '',
    `- SRI share of ETFs: ${v.sriSharePct}%`,
    '',
    '### Long-term projection (today\'s euros, real returns)',
    `Assumptions: stocks ${pct(p.plan.realReturnStocks)}, bonds ${pct(p.plan.realReturnBonds)}/yr real → blended ${pct(g.realReturn)} · ${eur(g.perBuyEur)} × ${g.buysPerYear} buys/yr · start ${eur(g.startEur)}${age != null ? ` · Yann is about ${age}` : ''}`,
    table(['In', 'Value'], proj.map((x) => [`${x.years} years${x.years === g.buffettYears ? ' (age 96)' : ''}`, eur(x.valueEur)])),
    '',
    '### Compared with simple strategies (same new money on the same dates)',
    table(['Strategy', 'Value now', 'vs actual'], [['Actual portfolio', eur(v.valueEur), '—'], ...v.legends.map((l) => [l.name, l.valueEur == null ? '?' : eur(l.valueEur), l.diffVsYou == null ? '?' : signed(l.diffVsYou, 'EUR')])]),
    warnings.length ? `\nData warnings: ${warnings.join('; ')}` : '',
  ].filter((l) => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1');
}

export interface InvoiceFilter {
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM
  client?: string;
  unpaidOnly?: boolean;
}

export function renderInvoices(d: FinanceData, today: string, f: InvoiceFilter = {}): string {
  const now = today.slice(0, 7);
  const open = d.shared ? new Set(unpaid(d.rows, d.shared.lines, now, 'EUR', d.fx).rows.map((u) => u.fileId)) : null;
  const needle = f.client ? clientKey(f.client) : null;
  const rows = d.rows.filter((r) => {
    const m = invoiceMonth(r);
    return (!f.from || m >= f.from) && (!f.to || m <= f.to) && (!needle || clientKey(r.invoice.clientName).includes(needle)) && (!f.unpaidOnly || open?.has(r.fileId));
  });
  const rate = (x: number) => (x ? pct(x, 2).replace(/\.?0+%$/, '%') : '');
  return [
    `${rows.length} invoice(s)${open ? '' : ' (paid status unknown: shared account not imported)'}.`,
    table(
      ['Number', 'Month', 'Client', 'Country', 'Currency', 'Subtotal', 'VAT', 'IRPF', 'Withholding', 'Total', 'Status'],
      rows.map((r) => {
        const i = r.invoice;
        return [i.number ?? r.title, invoiceMonth(r), i.clientName, effectiveCountry(r), i.currency, i.subtotal == null ? '?' : money(i.subtotal, i.currency, true), rate(i.vatRate), rate(i.irpfRate), rate(i.withholdingRate), i.total == null ? '?' : money(i.total, i.currency, true), open ? (open.has(r.fileId) ? 'unpaid' : 'paid or before tracking') : ''];
      }),
    ),
  ].join('\n');
}

const NOT_COVERED = [
  'Business expenses and deductible costs (so no net profit or exact Modelo 130 / annual IRPF figure)',
  'Social security (cuota de autónomo) other than as a shared-account expense line',
  'Bank balances other than IBKR cash and the Livret Bleu; pensions; debts or mortgages; property',
  'Income that is not invoiced through this app',
];

/** The whole picture as Markdown, for pasting into Claude or serving over MCP. */
export function renderSnapshot(d: FinanceData, today: string, ccy: DisplayCurrency = 'EUR'): string {
  const warnings = [
    d.fx.approximate ? 'Live ECB rates were unavailable: currency conversions use saved monthly rates and are approximate.' : '',
    d.failed ? `${d.failed} invoice sheet(s) could not be re-read; their last indexed version is used.` : '',
  ].filter(Boolean);
  return [
    `# Finance snapshot · ${today}`,
    'Yann Klein: freelancer based in Barcelona, invoicing clients in EUR, JPY and USD; household shared account kept in JPY and EUR; savings in ETFs at Interactive Brokers (IBKR) and a French Livret Bleu.',
    `Display currency: ${ccy}. Exchange rates: ECB monthly averages.`,
    ...warnings.map((w) => `> ⚠ ${w}`),
    '',
    renderBusiness(d, today, ccy),
    '',
    renderTaxSection(d, today),
    '',
    renderHousehold(d, ccy),
    '',
    d.invest ? renderPortfolio(d.invest, today) : '## Portfolio\n_No portfolio sheet is linked._',
    '',
    '## Not covered by this data',
    ...NOT_COVERED.map((x) => `- ${x}`),
  ].join('\n');
}

export async function buildSnapshot(g: Google, today: string, ccy: DisplayCurrency = 'EUR', opts: { sync?: boolean } = {}): Promise<string> {
  return renderSnapshot(await loadFinance(g, today, opts), today, ccy);
}
