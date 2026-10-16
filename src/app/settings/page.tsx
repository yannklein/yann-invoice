import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getGoogle } from '@/lib/google/client';
import { resolveIds } from '@/lib/google/drive';
import { readSettings } from '@/lib/index/store';
import { previewSetup } from '@/lib/setup';
import { fullResyncAction, runSetupAction, saveSettingsAction } from './actions';
import { PortfolioLinkCard } from './PortfolioLinkCard';
import { SharedImportCard } from './SharedImportCard';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ shared?: string; sharedError?: string; portfolioError?: string }> }) {
  const { shared, sharedError, portfolioError } = await searchParams;
  const g = await getGoogle();
  const ids = await resolveIds(g.drive);

  if (!ids) {
    const toMove = await previewSetup(g);
    return (
      <Card>
        <CardHeader><CardTitle>First-time setup</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            This creates a Drive folder <b>Invoices</b>, moves the {toMove.length} sheets below into it (their links keep working),
            and creates <b>Invoice Template</b> and <b>Invoice Index</b>. Indexing takes about a minute.
          </p>
          <ul className="max-h-80 list-disc overflow-auto pl-6">{toMove.map((f) => <li key={f.id}>{f.name}</li>)}</ul>
          <form action={runSetupAction}><Button type="submit">Run setup</Button></form>
        </CardContent>
      </Card>
    );
  }

  const settings = await readSettings(g.sheets, ids.indexId);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent>
          <form action={saveSettingsAction} className="grid max-w-sm gap-3">
            <Label htmlFor="irpfPercent">IRPF rate (%)</Label>
            <Input id="irpfPercent" name="irpfPercent" type="number" step="0.01" defaultValue={+(settings.irpfRate * 100).toFixed(2)} />
            <Label htmlFor="defaultTerms">Default terms (new clients)</Label>
            <Input id="defaultTerms" name="defaultTerms" defaultValue={settings.defaultTerms} />
            <Button type="submit" className="w-fit">Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Drive</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex gap-4">
            <a className="underline" href={`https://drive.google.com/drive/folders/${ids.folderId}`} target="_blank">Invoices folder ↗</a>
            <a className="underline" href={`https://docs.google.com/spreadsheets/d/${ids.templateId}/edit`} target="_blank">Template ↗</a>
            <a className="underline" href={`https://docs.google.com/spreadsheets/d/${ids.indexId}/edit`} target="_blank">Index ↗</a>
          </p>
          <p>To change your sender details, edit the template in Sheets.</p>
          <form action={fullResyncAction}><Button variant="outline" type="submit">Full resync (≈1 min)</Button></form>
        </CardContent>
      </Card>
      <SharedImportCard g={g} previewParam={shared} inputError={!!sharedError} />
      <PortfolioLinkCard g={g} inputError={!!portfolioError} />
    </div>
  );
}
