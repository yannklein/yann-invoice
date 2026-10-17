import { domicileOf, exchangeOf, justEtfUrl } from '@/lib/invest/domicile';
import type { SymbolInfo } from '@/lib/invest/types';

/** A fund as you'd search it at the broker: ticker linked to its justETF page, ISIN and exchange, and a US-domicile warning. */
export function FundRef({ symbol, info, label }: { symbol: string; info?: SymbolInfo; label?: string }) {
  const url = info ? justEtfUrl(info.isin) : null;
  const exchange = info ? exchangeOf(info.yahoo) : null;
  const dom = info ? domicileOf(info.isin) : { country: null, eu: false };
  return (
    <span className="inline-flex flex-col">
      <span>
        {url ? <a className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" href={url} target="_blank" rel="noreferrer">{label ?? symbol}</a> : (label ?? symbol)}
        {!dom.eu && <span className="ml-1 text-xs text-amber-400">⚠ {dom.country ? `${dom.country}-domiciled` : 'no ISIN'}: check US estate tax</span>}
      </span>
      {info?.isin && <span className="text-[11px] text-foreground/45">{info.isin}{exchange ? ` · ${exchange}` : ''}</span>}
    </span>
  );
}
