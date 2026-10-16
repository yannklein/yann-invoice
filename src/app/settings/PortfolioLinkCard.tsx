import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Google } from '@/lib/google/client';
import { findPortfolioId } from '@/lib/invest/store';
import { sheetUrl } from '@/lib/invoice/pdf';
import { linkPortfolioAction } from './actions';

export async function PortfolioLinkCard({ g, inputError }: { g: Google; inputError: boolean }) {
  const portfolioId = await findPortfolioId(g.drive);
  return (
    <Card id="portfolio">
      <CardHeader><CardTitle>Portfolio sheet</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {portfolioId ? (
          <p>
            Using <a className="underline" href={sheetUrl(portfolioId)} target="_blank">this sheet ↗</a> for <a className="underline" href="/invest">Invest</a>.
            Linking again only adds missing tabs.
          </p>
        ) : (
          <p>Link &ldquo;Stock mix&rdquo;: the app adds its own tabs (Trades, Deposits, …) and never changes your existing tabs.</p>
        )}
        <form action={linkPortfolioAction} className="grid max-w-xl gap-2">
          <Label htmlFor="portfolio-sheet">Sheet URL or ID</Label>
          <div className="flex gap-2">
            <Input id="portfolio-sheet" name="sheet" defaultValue={portfolioId ?? ''} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <Button type="submit">Link</Button>
          </div>
          {inputError && <p className="text-xs text-destructive">That is not a Google Sheets URL or ID.</p>}
        </form>
      </CardContent>
    </Card>
  );
}
