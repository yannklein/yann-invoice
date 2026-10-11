/** Today's ECB EUR→JPY rate (frankfurter.app), or null when it cannot be fetched. Cached for an hour. */
export async function fetchEurJpy(): Promise<number | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=JPY', { signal: AbortSignal.timeout(3000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const rate = (await res.json())?.rates?.JPY;
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
