import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readIndex } from '@/lib/index/store';
import { contentDisposition, pdfExportUrl, pdfFileName } from '@/lib/invoice/pdf';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGoogle();
  const ids = await requireIds(g);
  const row = (await readIndex(g.sheets, ids.indexId)).find((r) => r.fileId === id);
  if (!row) return new Response('Not found', { status: 404 }); // only indexed invoices can be exported
  const res = await fetch(pdfExportUrl(id), { headers: { Authorization: `Bearer ${g.accessToken}` } });
  if (!res.ok || !res.body) return new Response(`PDF export failed (${res.status})`, { status: 502 });
  return new Response(res.body, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(pdfFileName(row)) },
  });
}
