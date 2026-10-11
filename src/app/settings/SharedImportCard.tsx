import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Google } from '@/lib/google/client';
import { sheetUrl } from '@/lib/invoice/pdf';
import { currentMonth } from '@/lib/shared/model';
import { findSharedId, parseSheetId, previewImport, type ImportPreview } from '@/lib/shared/store';
import { previewSharedImportAction, runSharedImportAction } from './actions';

const kjpy = (x: number) => x.toFixed(2);

export async function SharedImportCard({ g, previewParam, inputError }: { g: Google; previewParam?: string; inputError: boolean }) {
  const previewId = previewParam ? parseSheetId(previewParam) : null;
  const sharedId = await findSharedId(g.drive);
  let preview: ImportPreview | null = null;
  let previewError: string | null = null;
  if (previewId) {
    try {
      preview = await previewImport(g.sheets, previewId, currentMonth());
    } catch (e) {
      previewError = e instanceof Error ? e.message : String(e);
    }
  }
  const failing = preview?.months.filter((m) => !m.ok) ?? [];

  return (
    <Card id="shared">
      <CardHeader><CardTitle>Shared account</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {sharedId ? (
          <p>
            Using <a className="underline" href={sheetUrl(sharedId)} target="_blank">this sheet ↗</a> (tabs <b>Months</b> and <b>Lines</b>).
            Re-importing replaces both tabs with what is in the old monthly tabs.
          </p>
        ) : (
          <p>Import “Shared account money” once: its monthly tabs are copied into two new tabs, <b>Months</b> and <b>Lines</b>. The old tabs are not changed.</p>
        )}
        <form action={previewSharedImportAction} className="grid max-w-xl gap-2">
          <Label htmlFor="sheet">Sheet URL or ID</Label>
          <div className="flex gap-2">
            <Input id="sheet" name="sheet" defaultValue={previewId ?? sharedId ?? ''} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <Button type="submit" variant="outline">Preview</Button>
          </div>
          {inputError && <p className="text-xs text-destructive">That is not a Google Sheets URL or ID.</p>}
        </form>

        {previewError && <p className="text-destructive">Could not read that sheet: {previewError}</p>}
        {preview && (
          <div className="space-y-3">
            <p>
              <b>{preview.title}</b>: {preview.months.length} months, {preview.months.reduce((n, m) => n + m.lines.length, 0)} lines.
              {preview.skipped.length > 0 && <> Ignored tabs: {preview.skipped.join(', ')}.</>}
              {preview.hasAppTabs && <> <b>Months/Lines already exist and will be replaced.</b></>}
            </p>
            <table className="w-full max-w-xl text-left">
              <thead className="text-foreground/50">
                <tr><th>Tab</th><th>Month</th><th className="text-right">Lines</th><th className="text-right">JPY/EUR</th><th className="text-right">Sheet kJPY</th><th className="text-right">Imported</th></tr>
              </thead>
              <tbody>
                {preview.months.map((m) => (
                  <tr key={m.month} className={m.ok ? '' : 'text-amber-400'}>
                    <td>{m.tab}</td><td>{m.month}</td><td className="text-right">{m.lines.length}</td><td className="text-right">{m.fx}</td>
                    <td className="text-right">{m.expectedKjpy == null ? '—' : kjpy(m.expectedKjpy)}</td>
                    <td className="text-right">{kjpy(m.actualKjpy)} {m.ok ? '✓' : '≠'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {failing.length > 0 && <p className="text-amber-400">{failing.length} tab(s) do not add up to their own total; check them after importing.</p>}
            <form action={runSharedImportAction}>
              <input type="hidden" name="sheet" value={previewId ?? ''} />
              <Button type="submit">Import {preview.months.length} months</Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
